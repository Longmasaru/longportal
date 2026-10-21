import { timingSafeEqual } from "node:crypto";
import { runEnabledBots } from "./run";

// 毎朝の定時の実行の入口(Vercel Cron。vercel.json の crons)。docs/DESIGN.md 39 章。
// Vercel は環境変数 CRON_SECRET を「Authorization: Bearer <値>」で送ってくるので、それと同じときだけ動かす。
// CRON_SECRET がなければ動かさない(deny by default)。

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function handleBotsCron(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const outcomes = await runEnabledBots();
  for (const o of outcomes) console.log(`[bots] ${o.name}: ${o.status}`);
  return Response.json({ outcomes: outcomes.map(({ botId, status }) => ({ botId, status })) });
}
