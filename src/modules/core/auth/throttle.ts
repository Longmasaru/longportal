import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { loginAttempts } from "./schema";
import { LOGIN_FAILURE_LIMIT, LOGIN_WINDOW_MINUTES, isThrottled, type FailureCounts } from "./throttle-policy";

// ログインの失敗回数の制限(DB 側)。規則は throttle-policy.ts。
//
// 記録の読み書きに失敗しても、ログイン自体は止めない(制限が効かないだけ)。失敗はサーバーのログに残す。
// 記録のテーブルがまだない環境(migration の適用前)でも、ログインできるようにするため。

const windowInterval = sql.raw(`interval '${LOGIN_WINDOW_MINUTES} minutes'`);

async function countFailures(loginId: string, ip: string | null): Promise<FailureCounts> {
  // 同じ ID の失敗は、直近の時間内で、かつ「最後の成功」より後のものだけを数える(成功でリセットされる)。
  const [login] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.loginId, loginId),
        eq(loginAttempts.succeeded, false),
        sql`${loginAttempts.attemptedAt} > now() - ${windowInterval}`,
        sql`${loginAttempts.attemptedAt} > coalesce(
          (select max(a.attempted_at) from core.login_attempts a where a.login_id = ${loginId} and a.succeeded = true),
          '-infinity'::timestamptz
        )`,
      ),
    );

  let ipFailures = 0;
  if (ip) {
    const [byIp] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.ip, ip),
          eq(loginAttempts.succeeded, false),
          sql`${loginAttempts.attemptedAt} > now() - ${windowInterval}`,
        ),
      );
    ipFailures = byIp?.n ?? 0;
  }
  return { loginFailures: login?.n ?? 0, ipFailures };
}

/** いま、この ID・接続元からの試行を止めるべきか。記録を読めない場合は止めない(ログに残す)。 */
export async function isLoginThrottled(loginId: string, ip: string | null): Promise<boolean> {
  try {
    return isThrottled(await countFailures(loginId, ip));
  } catch (err) {
    console.error("[login-throttle] 失敗回数を確認できませんでした(制限なしで続行):", err);
    return false;
  }
}

/**
 * この ID で、あと何回まちがえるとロックされるか(画面の案内用)。読めなければ null。
 * 存在しない ID も同じように数えるので、この数から ID の有無は分からない。
 */
export async function remainingLoginAttempts(loginId: string): Promise<number | null> {
  try {
    const { loginFailures } = await countFailures(loginId, null);
    return Math.max(0, LOGIN_FAILURE_LIMIT - loginFailures);
  } catch (err) {
    console.error("[login-throttle] 失敗回数を確認できませんでした:", err);
    return null;
  }
}

/** ログインの試行を記録する。記録できなくても、ログイン自体は続ける。 */
export async function recordLoginAttempt(
  loginId: string,
  ip: string | null,
  succeeded: boolean,
): Promise<void> {
  try {
    await db.insert(loginAttempts).values({ loginId, ip, succeeded });
    // 古い記録は、ときどき削除する(30 日より前)。
    if (Math.random() < 0.02) {
      await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, sql`now() - interval '30 days'`));
    }
  } catch (err) {
    console.error("[login-throttle] ログインの試行を記録できませんでした:", err);
  }
}

/** 管理者がパスワードを再設定したときなどに、その ID のロック(失敗の記録)を解除する。 */
export async function clearLoginFailures(loginId: string): Promise<void> {
  try {
    await db
      .delete(loginAttempts)
      .where(and(eq(loginAttempts.loginId, loginId), eq(loginAttempts.succeeded, false)));
  } catch (err) {
    console.error("[login-throttle] ロックを解除できませんでした:", err);
  }
}
