import { z } from "zod";

// パスワードの規則。bcryptjs に依存しないので、クライアントコンポーネントからも参照できる。

export const MIN_PASSWORD_LENGTH = 8;

/** bcrypt は先頭 72 バイトしか見ないため、それを超える長さは受け付けない。 */
const MAX_PASSWORD_BYTES = 72;

export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。`)
  .refine((v) => new TextEncoder().encode(v).length <= MAX_PASSWORD_BYTES, {
    message: "パスワードが長すぎます(72バイト以内)。",
  });

/**
 * 初回ログインの直後は、パスワードの変更で「現在のパスワード(初期パスワード)」をもう一度聞かない。
 * ログインで初期パスワードを確かめたばかりなので。時間がたった画面(席を離れた間など)では、聞き直す。
 */
export const FIRST_LOGIN_GRACE_MINUTES = 15;

export function canSkipCurrentPassword(
  mustChangePassword: boolean,
  lastLoginAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!mustChangePassword || !lastLoginAt) return false;
  const elapsed = now.getTime() - lastLoginAt.getTime();
  return elapsed >= 0 && elapsed <= FIRST_LOGIN_GRACE_MINUTES * 60_000;
}
