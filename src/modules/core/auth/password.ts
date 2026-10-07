import bcrypt from "bcryptjs";

// パスワードのハッシュ化と照合(サーバー専用)。規則は password-policy.ts。
const BCRYPT_COST = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
