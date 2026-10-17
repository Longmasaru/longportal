import Anthropic from "@anthropic-ai/sdk";
import { KIND_LABELS, type CommentKind } from "./tsukkomi";

// ツッコミの下書き(音声入力のメモなど)を、読みやすい文に整えた案を作る(Claude。docs/DESIGN.md 32 章)。
// 送るのは、ツッコミの種類・節の題名・引用・下書きだけ(名前は送らない)。保存はしない(案を画面に返すだけ)。

const MODEL = "claude-haiku-5-5";
const TIMEOUT_MS = 30_000;

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

export type PolishResult = { text: string } | { error: string };

export async function polishTsukkomi(input: {
  kind: CommentKind;
  sectionTitle: string;
  quote: string;
  body: string;
}): Promise<PolishResult> {
  const api = anthropic();
  if (!api) return { error: "AI の設定がされていないため、整えられません。" };
  const context = [
    `ツッコミの種類: ${KIND_LABELS[input.kind].label}(${KIND_LABELS[input.kind].hint})`,
    input.sectionTitle ? `教科書の節: ${input.sectionTitle}` : "",
    input.quote ? `引用した文: 「${input.quote}」` : "",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const response = await api.messages.create({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: "low" },
      system: [
        "あなたは、工場の社員が社内の教科書(仕事のやり方の手引き)を読んで書いた「ツッコミ」(疑問・付け足し・まちがいの指摘・感想)を、教科書を作るチームに伝わる文に整えるアシスタントです。",
        "入力は、スマホで打ったり音声入力したりしたメモです。次の決まりで整えた本文だけを出力してください。",
        "- 誤字・脱字、音声入力の聞き間違いと思われる語、話し言葉の言いよどみ(えー、あの、なんか など)を直す。",
        "- 何が気になったか・どうしてほしいか・今の現場ではどうしているか、が分かる順に並べる。長いときだけ「・」の箇条書きにする。",
        "- 書かれていない事実・意見・推測を足さない。数字・日付・名前・道具や機械の名前はそのまま残す。",
        "- 書いた人の言いたいことと口調のやわらかさを保ち、です・ます調で簡潔にする(多くても 300 字ほど)。",
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
    console.error(`[kyokasho] ツッコミの整理に失敗しました(${err instanceof Anthropic.APIError ? (err.status ?? "接続") : "不明"})`);
    return { error: "AI につながりませんでした。少し待ってから、もう一度お試しください。" };
  }
}
