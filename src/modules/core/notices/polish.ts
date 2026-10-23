import Anthropic from "@anthropic-ai/sdk";

// お知らせの本文の書きかけ(音声入力のメモなど)を、社員に伝わる文に整えた案を作る(Claude。docs/DESIGN.md 23.1)。
// 送るのはタイトルと本文だけ。保存はしない(案を画面に返し、使うかどうかは書いた人が決める)。

const MODEL = "claude-haiku-5-5";
const TIMEOUT_MS = 30_000;

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

export type PolishResult = { text: string } | { error: string };

export async function polishNotice(input: { title: string; body: string }): Promise<PolishResult> {
  const api = anthropic();
  if (!api) return { error: "AI の設定がされていないため、整えられません。" };
  try {
    const response = await api.messages.create({
      model: MODEL,
      max_tokens: 4096,
      output_config: { effort: "low" },
      system: [
        "あなたは、工場の会社の社内ポータルに載せる「お知らせ」の本文を、社員に伝わる文に整えるアシスタントです。",
        "入力は、管理者がパソコンやスマホで打ったり音声入力したりした下書きです。次の決まりで整えた本文だけを出力してください。",
        "- 誤字・脱字、音声入力の聞き間違いと思われる語、話し言葉の言いよどみを直す。",
        "- 何のお知らせか・いつ・どこで・誰が・何をすればよいかが分かる順に並べる。項目が多いときは「・」の箇条書きにする。",
        "- 書かれていない事実・日付・数字を足さない。日付・時刻・数字・場所・名前・URL はそのまま残す。",
        "- です・ます調で、短く分かりやすくする。元の長さから大きく変えない。",
        "- 出力は本文だけ。タイトル(件名)は別の欄にあるので、本文の頭に見出しや件名を付けない。",
        "- 前置きや説明、Markdown の記号(# や **)は付けない。",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `タイトル: ${input.title || "(まだありません)"}\n\n<draft>\n${input.body}\n</draft>`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return { error: "AI が整えられませんでした。文章を見直してください。" };
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (!text) return { error: "AI から案が返りませんでした。もう一度お試しください。" };
    return { text };
  } catch (err) {
    console.error(`[notices] 文の整理に失敗しました(${err instanceof Anthropic.APIError ? (err.status ?? "接続") : "不明"})`);
    return { error: "AI につながりませんでした。少し待ってから、もう一度お試しください。" };
  }
}
