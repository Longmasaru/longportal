import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// タスク名からカテゴリを 1 つ選ぶ(Claude による自動分類。docs/DESIGN.md 25 章)。
// 送るのはタスク名とカテゴリ一覧だけ。API キーが無い・失敗・断られた場合は fallbackCode を返し、
// TODO の追加は止めない。

const MODEL = "claude-haiku-5-5";
const TIMEOUT_MS = 10_000;

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

export async function classifyCategory(
  text: string,
  categories: { code: string; label: string }[],
  fallbackCode: string,
): Promise<string> {
  const api = anthropic();
  const codes = categories.map((c) => c.code);
  if (!api || codes.length === 0) return fallbackCode;

  const Schema = z.object({ category: z.enum(codes as [string, ...string[]]) });
  try {
    const response = await api.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low", format: zodOutputFormat(Schema) },
      system:
        "あなたは、工場で働く社員の業務 TODO を分類するアシスタントです。タスク名を読み、与えられたカテゴリ一覧から最も当てはまるものを 1 つ選んでください。判断がつかない場合は other を選んでください。",
      messages: [
        {
          role: "user",
          content: `タスク: ${text}\n\nカテゴリ一覧:\n${categories.map((c) => `- ${c.code}: ${c.label}`).join("\n")}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return fallbackCode;
    return response.parsed_output?.category ?? fallbackCode;
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`[todo] 自動分類に失敗しました(${err.status ?? "接続"}): その他にします`);
    } else {
      console.error("[todo] 自動分類に失敗しました: その他にします", err);
    }
    return fallbackCode;
  }
}
