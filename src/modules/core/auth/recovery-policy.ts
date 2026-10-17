import { z } from "zod";

// パスワード再設定・メール確認の規則(純粋な関数と検証。DB に依存しない)。docs/DESIGN.md 26 章。

/** トークンの有効期間(分)。 */
export const TOKEN_TTL_MINUTES = { email_verify: 24 * 60, password_reset: 30 } as const;

/** 同じアカウントに、再設定のメールを送れる回数(1 時間あたり)。 */
export const RESET_MAIL_LIMIT_PER_HOUR = 3;

/** メールアドレスの検証(前後の空白を除き、小文字にそろえる)。 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "メールアドレスを入力してください。")
  .max(254, "メールアドレスが長すぎます。")
  .pipe(z.email("メールアドレスの形が正しくありません。"));

/** トークンの形(URL に載せる 32 バイトの乱数。base64url で 43 文字)。 */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "リンクが正しくありません。");

/** トークンが使えるか(期限内で、まだ使っていない)。 */
export function isTokenUsable(token: { expiresAt: Date; usedAt: Date | null }, now: Date): boolean {
  return token.usedAt === null && token.expiresAt.getTime() > now.getTime();
}

/** メールに書くために、アドレスの一部を伏せる(例: ya****@e-long.co.jp)。 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "****";
  return `${local.slice(0, 2)}${"*".repeat(Math.max(2, local.length - 2))}@${domain}`;
}
