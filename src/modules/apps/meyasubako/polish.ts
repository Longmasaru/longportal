import Anthropic from "@anthropic-ai/sdk";
import { CATEGORY_LABEL, type MeyasubakoCategory } from "./constants";

// 目安箱の書きかけ(音声入力のメモなど)を、読みやすい文に整えた案を作る(Claude。docs/DESIGN.md 42 章)。
// 送るのは、カテゴリ(分かれば)と書きかけの文だけ(投稿者の名前は送らない)。保存はしない(案を画面に返すだけ)。

const MODEL = "claude-haiku-5-5";
const TIMEOUT_MS = 30_000;

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

export type PolishResult = { text: string } | { error: string };

export async function polishMeyasubako(input: {
  /** 投稿なら "post"、やり取り(返事・書き足し)なら "reply"。 */
  purpose: "post" | "reply";
  category: MeyasubakoCategory | null;
  body: string;
}): Promise<PolishResult> {
  const api = anthropic();
  if (!api) return { error: "AI の設定がされていないため、整えられません。" };
  const context =
    input.purpose === "post"
      ? input.category
        ? `投稿の種類: ${CATEGORY_LABEL[input.category].label}${CATEGORY_LABEL[input.category].hint ? `(${CATEGORY_LABEL[input.category].hint})` : ""}`
        : "投稿の種類: まだ選ばれていません"
      : "目安箱の投稿へのやり取り(返事・書き足し)です。";
  try {
    const response = await api.messages.create({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: "low" },
      system: [
        "あなたは、工場の社員が会社の「目安箱」(要望・ヒヤリハット・困りごと・意見・欲しいものなど)に書いた文を、読む人に伝わる文に整えるアシスタントです。",
        "入力は、スマホで打ったり音声入力したりしたメモです。次の決まりで整えた本文だけを出力してください。",
        "- 誤字・脱字、音声入力の聞き間違いと思われる語、話し言葉の言いよどみ(えー、あの、なんか など)を直す。",
        "- 何があったか・どこで・どう困るか・どうしてほしいか、が分かる順に並べる。長いときだけ「・」の箇条書きにする。",
        "- 書かれていない事実・意見・推測を足さない。数字・日付・場所・名前・道具や機械の名前はそのまま残す。",
        "- 書いた人の言いたいことと気持ちを保ち、です・ます調で簡潔にする(多くても 400 字ほど)。",
        "- 前置きや説明、Markdown の記号(# や **)は付けない。",
      ].join("\n"),
      messages: [{ role: "user", content: `${context}\n\n<memo>\n${input.body}\n</memo>` }],
    });
    if (response.stop_reason === "refusal") return { error: "AI が整えられませんでした。文章を見直してください。" };
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (!text) return { error: "AI から案が返りませんでした。もう一度お試しください。" };
    return { text };
  } catch (err) {
    console.error(`[meyasubako] 文の整理に失敗しました(${err instanceof Anthropic.APIError ? (err.status ?? "接続") : "不明"})`);
    return { error: "AI につながりませんでした。少し待ってから、もう一度お試しください。" };
  }
}
