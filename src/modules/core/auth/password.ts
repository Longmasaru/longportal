import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

// パスワードのハッシュ化と照合(サーバー専用)。規則は password-policy.ts。
const BCRYPT_COST = 10;

/** 初期(一時)パスワード。読み間違えにくい文字だけで 12 文字。本人が初回ログインで変更する。 */
export function generateTempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
