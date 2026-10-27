import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { googleServiceAccount } from "@/modules/core/google";
import { appBaseUrl } from "@/modules/core/mail";
import { syncAllBooks } from "./sync";
import { pushCommentsToGoogle } from "./tsukkomi-google";

// 毎日の定時の同期の入口(Vercel Cron。vercel.json の crons)。docs/DESIGN.md 30 章。
// Vercel は環境変数 CRON_SECRET を「Authorization: Bearer <値>」で送ってくるので、それと同じときだけ動かす。
// CRON_SECRET がなければ動かさない(deny by default)。
// 同期のあと、元の Google ドキュメントにまだ付いていないツッコミをコメントとして付ける(32 章。取りこぼしの拾い直し)。

/** 関数の時間の上限(route の maxDuration)より前に、新しい教科書の同期を始めるのをやめる(あとの Google のコメントの分を残す)。 */
const BUDGET_MS = 220_000;

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
  const google = googleServiceAccount() ? await pushCommentsToGoogle(appBaseUrl()) : null;
  if (google) console.log(`[kyokasho-sync] Google のコメント: 付けた ${google.added}・付いていた ${google.skipped}・失敗 ${google.failed}`);
  return Response.json({ outcomes, google });
}
