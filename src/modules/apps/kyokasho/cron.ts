import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { syncAllBooks } from "./sync";

// 毎日の定時の同期の入口(Vercel Cron。vercel.json の crons)。docs/DESIGN.md 30 章。
// Vercel は環境変数 CRON_SECRET を「Authorization: Bearer <値>」で送ってくるので、それと同じときだけ動かす。
// CRON_SECRET がなければ動かさない(deny by default)。

/** 関数の時間の上限(route の maxDuration)より前に、新しい教科書の同期を始めるのをやめる。 */
const BUDGET_MS = 240_000;

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function handleSyncCron(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const outcomes = await syncAllBooks({ deadline: Date.now() + BUDGET_MS });
  if (outcomes.some((o) => o.status === "updated")) revalidatePath("/apps/kyokasho", "layout");
  for (const o of outcomes) console.log(`[kyokasho-sync] ${o.slug}: ${o.status} ${o.message}`);
  return Response.json({ outcomes });
}
