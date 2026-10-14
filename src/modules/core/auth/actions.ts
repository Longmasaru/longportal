"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AuthError, type CredentialsSignin } from "next-auth";
import { z } from "zod";
import { db } from "@/db/client";
import { requireActor } from "../access";
import { signIn, signOut } from "./auth";
import { newPasswordSchema } from "./password-policy";
import { hashPassword, verifyPassword } from "./password";
import { MAX_LOGIN_ID_LENGTH, MAX_LOGIN_PASSWORD_LENGTH } from "./throttle-policy";
import { users } from "./schema";

// クライアントコンポーネントから呼べる Server Action。サーバー専用の API は index.ts から参照する。

export type FormState = { error?: string } | undefined;

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const loginId = String(formData.get("loginId") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!loginId || !password) return { error: "ログインIDとパスワードを入力してください。" };
  // 異常に長い入力は、照合せずに(通常の失敗と同じ文言で)弾く。
  if (loginId.length > MAX_LOGIN_ID_LENGTH || password.length > MAX_LOGIN_PASSWORD_LENGTH) {
    return { error: "ログインIDまたはパスワードが違います。" };
  }

  try {
    await signIn("credentials", { loginId, password, redirectTo: "/" });
  } catch (err) {
    // Auth.js はログイン成功時のリダイレクトを例外として投げる。AuthError 以外は必ず再送出する。
    if (err instanceof AuthError) {
      if (err.type === "CredentialsSignin") {
        const code = (err as CredentialsSignin).code;
        if (code === "too_many_attempts") {
          return {
            error: "ログインの試行回数が多すぎます。しばらく(15分ほど)待ってから、もう一度お試しください。",
          };
        }
        return {
          error:
            code === "account_unavailable"
              ? "このアカウントは現在ご利用いただけません。管理者に確認してください。"
              : "ログインIDまたはパスワードが違います。",
        };
      }
      return { error: "ログインに失敗しました。時間をおいて再度お試しください。" };
    }
    throw err;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "現在のパスワードを入力してください。")
    .max(MAX_LOGIN_PASSWORD_LENGTH, "現在のパスワードが違います。"),
  newPassword: newPasswordSchema,
  confirmPassword: z.string(),
});

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Server Action は proxy を通らないことがあるため、ここでも本判定を行う。
  const actor = await requireActor();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };

  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  if (newPassword !== confirmPassword) return { error: "新しいパスワードが一致しません。" };
  if (newPassword === currentPassword) {
    return { error: "新しいパスワードは現在のパスワードと異なるものにしてください。" };
  }

  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);
  if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
    return { error: "現在のパスワードが違います。" };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false })
    .where(eq(users.id, actor.userId));

  redirect("/");
}
