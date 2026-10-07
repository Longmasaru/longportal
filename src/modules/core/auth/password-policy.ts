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
