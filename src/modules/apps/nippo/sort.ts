import Anthropic from "@anthropic-ai/sdk";
import { FIELD_DEF, SCORE_MAX, SCORE_MIN, TEXT_FIELDS } from "./labels";
import { sanitizeSorted, type ReportFields } from "./logic";

// 録音の文字起こしや走り書きのメモを、日報の項目に振り分けた案を作る(Claude。docs/DESIGN.md 39 章)。
// 送るのは、本人が貼ったメモだけ。保存はしない(案を画面に返すだけ)。

const MODEL = "claude-haiku-5-5";
const TIMEOUT_MS = 60_000;
const TOOL_NAME = "fill_report";

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

const properties = {
  ...Object.fromEntries(
    TEXT_FIELDS.map((f) => [f, { type: "string", description: `${FIELD_DEF[f].section} / ${FIELD_DEF[f].label}` }]),
  ),
  score: {
    type: "integer",
    minimum: SCORE_MIN,
    maximum: SCORE_MAX,
    description: "6. コンディション: 今日の点数(10 点満点)。メモに数字があるときだけ。",
  },
  scoreNote: { type: "string", description: "6. コンディション: 点数の理由・一言" },
};

export type SortResult = { fields: Partial<ReportFields> } | { error: string };

export async function sortMemo(memo: string): Promise<SortResult> {
  const api = anthropic();
  if (!api) return { error: "AI の設定がされていないため、振り分けられません。" };
  try {
    const response = await api.messages.create({
      model: MODEL,
      max_tokens: 8192,
      output_config: { effort: "low" },
      system: [
        "あなたは、金属加工の会社の新人が書く日報の下書きを手伝うアシスタントです。",
        "入力は、1 日の録音の文字起こしや、新人の走り書きのメモです。内容を日報の項目に振り分けて、fill_report を呼んでください。",
        "- 誤字・脱字、音声認識の聞き間違いと思われる語、話し言葉の言いよどみ(えー、あの など)を直す。",
        "- 各項目は「・」の箇条書き。「質問して分かったこと」は「Q: … / A: …」の形にする。",
        "- 新人本人の言葉として、です・ます調ではなく「〜した」「〜を学んだ」の常体で簡潔に書く。",
        "- メモに書かれていない事実・感想・予定を足さない。当てはまる内容がない項目は空にするか、出さない。",
        "- 数字・日付・機械名・人の名前・社内の用語(展開、ブランク、ブレーキ など)はそのまま残す。",
        "- 点数は、メモに 10 点満点の点数が書かれているときだけ入れる。",
      ].join("\n"),
      tools: [
        {
          name: TOOL_NAME,
          description: "日報の各項目に入れる文章を渡す。",
          input_schema: { type: "object", properties },
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: `<memo>\n${memo}\n</memo>` }],
    });
    if (response.stop_reason === "refusal") return { error: "AI が振り分けられませんでした。メモを見直してください。" };
    const call = response.content.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
    const fields = sanitizeSorted(call && call.type === "tool_use" ? call.input : null);
    if (Object.keys(fields).length === 0) return { error: "メモから日報の項目を読み取れませんでした。" };
    return { fields };
  } catch (err) {
    console.error(`[nippo] メモの振り分けに失敗しました(${err instanceof Anthropic.APIError ? (err.status ?? "接続") : "不明"})`);
    return { error: "AI につながりませんでした。少し待ってから、もう一度お試しください。" };
  }
}
