import Anthropic from "@anthropic-ai/sdk";
import { RECORD_KIND_LABEL, type RecordKind } from "./labels";

// 記録の内容を、読みやすい形に整えた案を作る(Claude。docs/DESIGN.md 31.3)。
// 送るのは、氏名を伏せた本文と記録の種類だけ。保存はしない(案を画面に返すだけ)。

const MODEL = "claude-haiku-5-5";
const TIMEOUT_MS = 30_000;

/** 記録の種類ごとの見出しの例。当てはまる内容がない見出しは出させない。 */
const HEADINGS: Record<RecordKind, string> = {
  talk: "【状況】【本人の話】【伝えたこと】【次にやること】",
  caution: "【起きたこと】【伝えたこと】【本人の受け止め】【次にやること・再発防止】",
  praise: "【よかった点】【具体的な場面】【伝えたこと】",
  transfer: "【異動の内容】【理由・背景】【今後のこと】",
};

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

export type PolishResult = { text: string } | { error: string };

export async function polishRecordBody(kind: RecordKind, body: string): Promise<PolishResult> {
  const api = anthropic();
  if (!api) return { error: "AI の設定がされていないため、整えられません。" };
  try {
    const response = await api.messages.create({
      model: MODEL,
      max_tokens: 4096,
      output_config: { effort: "low" },
      system: [
        "あなたは、工場の上司が書いた人事の記録(面談・注意・ほめなど)を、読みやすく整えるアシスタントです。",
        "入力は、キーボードや音声入力で書かれたメモです。次の決まりで整えた本文だけを出力してください。",
        "- 誤字・脱字、音声入力の聞き間違いと思われる語、話し言葉の言いよどみ(えー、あの など)を直す。",
        `- 次の見出しを使い、見出しごとに「・」の箇条書きでまとめる: ${HEADINGS[kind]}。当てはまる内容がない見出しは出さない。`,
        "- 書かれていない事実・評価・推測を足さない。数字・日付・固有名詞はそのまま残す。",
        "- 「本人」は記録の対象の社員のこと。そのまま「本人」と書く。",
        "- です・ます調で、簡潔に。前置きや説明、Markdown の記号(# や **)は付けない。",
      ].join("\n"),
      messages: [{ role: "user", content: `記録の種類: ${RECORD_KIND_LABEL[kind]}\n\n<memo>\n${body}\n</memo>` }],
    });
    if (response.stop_reason === "refusal") return { error: "AI が整えられませんでした。文章を見直してください。" };
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (!text) return { error: "AI から案が返りませんでした。もう一度お試しください。" };
    return { text };
  } catch (err) {
    console.error(`[hr] 文章の整理に失敗しました(${err instanceof Anthropic.APIError ? (err.status ?? "接続") : "不明"})`);
    return { error: "AI につながりませんでした。少し待ってから、もう一度お試しください。" };
  }
}
