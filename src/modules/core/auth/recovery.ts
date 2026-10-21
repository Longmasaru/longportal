import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { appBaseUrl, sendMail } from "../mail";
import { canSkipCurrentPassword } from "./password-policy";
import { TOKEN_TTL_MINUTES, maskEmail } from "./recovery-policy";
import { authTokens, users, type AuthTokenPurpose } from "./schema";

// メール確認・パスワード再設定のトークンとメール(サーバー専用)。docs/DESIGN.md 26 章。
// トークン本体はメールにだけ載せ、DB には SHA-256 だけを保存する。

type Executor = Pick<typeof db, "select" | "insert" | "update">;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** トークンを発行する。同じ目的の、まだ使っていない古いトークンは無効にする。 */
export async function issueToken(
  tx: Executor,
  input: { userId: string; purpose: AuthTokenPurpose; email: string },
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await tx
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(eq(authTokens.userId, input.userId), eq(authTokens.purpose, input.purpose), isNull(authTokens.usedAt)));
  await tx.insert(authTokens).values({
    userId: input.userId,
    purpose: input.purpose,
    email: input.email,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MINUTES[input.purpose] * 60_000),
  });
  return token;
}

/**
 * トークンを使う(1 回だけ)。期限内・未使用・目的が同じときに、使用済みにして中身を返す。
 * 同時に 2 回使われても、片方だけが成功する(UPDATE ... WHERE used_at IS NULL)。
 */
export async function consumeToken(
  tx: Executor,
  token: string,
  purpose: AuthTokenPurpose,
): Promise<{ userId: string; email: string } | null> {
  const [row] = await tx
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, sql`now()`),
      ),
    )
    .returning({ userId: authTokens.userId, email: authTokens.email });
  return row ?? null;
}

/**
 * トークンが今使えるなら、その人のログイン ID を返す(使用済みにはしない。再設定の画面を出す前の確認用)。
 * ログイン ID は、ブラウザのパスワード保存が、どのアカウントのパスワードかを知るために使う。
 */
export async function peekToken(token: string, purpose: AuthTokenPurpose): Promise<string | null> {
  const [row] = await db
    .select({ loginId: users.loginId })
    .from(authTokens)
    .innerJoin(users, eq(users.id, authTokens.userId))
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, sql`now()`),
      ),
    );
  return row?.loginId ?? null;
}

/** 直近 1 時間に発行した、同じ目的のトークンの数(送りすぎの防止)。 */
export async function recentTokenCount(userId: string, purpose: AuthTokenPurpose): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.purpose, purpose),
        gt(authTokens.createdAt, sql`now() - interval '1 hour'`),
      ),
    );
  return n;
}

/** メール確認のメールを送る。 */
export async function sendVerificationMail(userId: string, email: string): Promise<void> {
  const token = await issueToken(db, { userId, purpose: "email_verify", email });
  const url = `${appBaseUrl()}/verify-email?token=${token}`;
  await sendMail({
    to: email,
    subject: "【LONG PORTAL】メールアドレスの確認",
    text: [
      "LONG PORTAL にメールアドレスが登録されました。",
      "下のリンクを開くと、確認が完了します(24 時間有効)。",
      "",
      url,
      "",
      "パスワードを忘れたときは、このアドレスに再設定の案内が届きます。",
      "心当たりがない場合は、このメールを破棄してください。",
    ].join("\n"),
  });
}

/** パスワード再設定のメールを送る。 */
export async function sendPasswordResetMail(userId: string, email: string, loginId: string): Promise<void> {
  const token = await issueToken(db, { userId, purpose: "password_reset", email });
  const url = `${appBaseUrl()}/reset-password?token=${token}`;
  await sendMail({
    to: email,
    subject: "【LONG PORTAL】パスワードの再設定",
    text: [
      `ログイン ID「${loginId}」のパスワードの再設定を受け付けました。`,
      "下のリンクを開いて、新しいパスワードを決めてください(30 分有効・1 回だけ使えます)。",
      "",
      url,
      "",
      `このメールは ${maskEmail(email)} に送っています。`,
      "心当たりがない場合は、このメールを破棄してください(パスワードは変わりません)。",
    ].join("\n"),
  });
}

/**
 * メール確認のリンクを開いたとき。トークンのアドレスが、今のアカウントのアドレスと同じときだけ確認済みにする
 * (確認メールを送ったあとにアドレスを変えていたら、古いリンクでは確認しない)。
 */
export async function verifyEmailToken(token: string): Promise<"verified" | "invalid"> {
  return db.transaction(async (tx) => {
    const used = await consumeToken(tx, token, "email_verify");
    if (!used) return "invalid";
    const [updated] = await tx
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(and(eq(users.id, used.userId), eq(users.email, used.email)))
      .returning({ id: users.id });
    return updated ? "verified" : "invalid";
  });
}

/** ログイン ID から、再設定のメールを送れるアカウント(有効・確認済みのメールあり)を探す。 */
export async function findResettableUser(loginId: string) {
  const [row] = await db
    .select({ id: users.id, loginId: users.loginId, email: users.email, status: users.status, verifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.loginId, loginId));
  if (!row || row.status !== "active" || !row.email || !row.verifiedAt) return null;
  return { id: row.id, loginId: row.loginId, email: row.email };
}

/** アカウントのメールアドレスの状態(画面の表示用)。 */
export async function getEmailStatus(userId: string): Promise<{ email: string | null; verified: boolean }> {
  const [row] = await db
    .select({ email: users.email, verifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId));
  return { email: row?.email ?? null, verified: Boolean(row?.email && row.verifiedAt) };
}

/** パスワードの変更で、現在のパスワードを聞かなくてよいか(初回ログインの直後。password-policy の規則)。 */
export async function canSkipCurrentPasswordFor(userId: string, mustChangePassword: boolean): Promise<boolean> {
  if (!mustChangePassword) return false;
  const [row] = await db.select({ lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.id, userId));
  return canSkipCurrentPassword(mustChangePassword, row?.lastLoginAt ?? null);
}
