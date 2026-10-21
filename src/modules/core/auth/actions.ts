"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AuthError, type CredentialsSignin } from "next-auth";
import { z } from "zod";
import { db } from "@/db/client";
import { requireActor } from "../access";
import { signIn, signOut } from "./auth";
import { PG_UNIQUE_VIOLATION, pgErrorCode } from "../shared/db-errors";
import { canSkipCurrentPassword, newPasswordSchema } from "./password-policy";
import { sendVerificationMail } from "./recovery";
import { emailSchema } from "./recovery-policy";
import { hashPassword, verifyPassword } from "./password";
import { normalizeLoginId } from "./input-checks";
import { remainingLoginAttempts } from "./throttle";
import { LOGIN_WINDOW_MINUTES, MAX_LOGIN_ID_LENGTH, MAX_LOGIN_PASSWORD_LENGTH } from "./throttle-policy";
import { users } from "./schema";

// クライアントコンポーネントから呼べる Server Action。サーバー専用の API は index.ts から参照する。

/** error は画面上部の通知、hints は見直すところの箇条書き。 */
export type FormState = { error?: string; hints?: string[] } | undefined;

/** ID かパスワードが違うときの、見直すところ(どちらが違うかは、安全のため言わない)。 */
const LOGIN_HINTS = [
  "ログインIDは社員番号です(例: 0123)。",
  "パスワードは、英字の大文字・小文字を区別します。",
  "初めてログインする方は、配られた初期パスワードを入れてください。",
];

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const loginId = normalizeLoginId(String(formData.get("loginId") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!loginId && !password) return { error: "ログインIDとパスワードを入力してください。" };
  if (!loginId) return { error: "ログインIDを入力してください。" };
  if (!password) return { error: "パスワードを入力してください。" };
  // 異常に長い入力は、照合せずに(通常の失敗と同じ文言で)弾く。
  if (loginId.length > MAX_LOGIN_ID_LENGTH || password.length > MAX_LOGIN_PASSWORD_LENGTH) {
    return { error: "ログインIDまたはパスワードが違います。", hints: LOGIN_HINTS };
  }

  try {
    await signIn("credentials", { loginId, password, redirectTo: "/" });
  } catch (err) {
    // Auth.js はログイン成功時のリダイレクトを例外として投げる。AuthError 以外は必ず再送出する。
    if (err instanceof AuthError) {
      if (err.type === "CredentialsSignin") {
        const code = (err as CredentialsSignin).code;
        if (code === "too_many_attempts") return lockedState();
        if (code === "account_unavailable") {
          return { error: "このアカウントは現在ご利用いただけません。管理者に確認してください。" };
        }
        const remaining = await remainingLoginAttempts(loginId);
        if (remaining === 0) return lockedState();
        const hints = [...LOGIN_HINTS];
        if (remaining !== null && remaining <= 3) {
          hints.push(`あと${remaining}回まちがえると、${LOGIN_WINDOW_MINUTES}分ほどログインできなくなります。`);
        }
        return { error: "ログインIDまたはパスワードが違います。", hints };
      }
      return { error: "ログインに失敗しました。時間をおいて再度お試しください。" };
    }
    throw err;
  }
}

function lockedState(): FormState {
  return {
    error: `まちがいが続いたため、しばらくログインできません。${LOGIN_WINDOW_MINUTES}分ほど待ってから、もう一度お試しください。`,
    hints: ["パスワードが分からないときは、下の「パスワードを忘れた方」から再設定できます。"],
  };
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

const changePasswordSchema = z.object({
  // 初回ログインの直後は空でよい(canSkipCurrentPassword)。必要かどうかは、DB の値で下で判定する。
  currentPassword: z.string().max(MAX_LOGIN_PASSWORD_LENGTH, "現在のパスワードが違います。"),
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

  const [row] = await db
    .select({ passwordHash: users.passwordHash, email: users.email, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);
  if (!row) return { error: "現在のパスワードが違います。" };

  // 初回ログインの直後は、ログインで初期パスワードを確かめたばかりなので、聞き直さない。
  if (!canSkipCurrentPassword(actor.mustChangePassword, row.lastLoginAt)) {
    if (!currentPassword) return { error: "現在のパスワードを入力してください。" };
    if (!(await verifyPassword(currentPassword, row.passwordHash))) {
      return { error: "現在のパスワードが違います。" };
    }
  }
  if (await verifyPassword(newPassword, row.passwordHash)) {
    return {
      error: actor.mustChangePassword
        ? "新しいパスワードは、初期パスワードと違うものにしてください。"
        : "新しいパスワードは現在のパスワードと異なるものにしてください。",
    };
  }

  // 初回ログインのときは、パスワードを忘れたときの連絡先として、メールアドレスを必須にする(docs/DESIGN.md 26 章)。
  // それ以外のメールの登録・変更は、updateEmailAction で行う。
  let newEmail: string | null = null;
  if (actor.mustChangePassword) {
    const email = emailSchema.safeParse(String(formData.get("email") ?? ""));
    if (!email.success) return { error: email.error.issues[0]?.message ?? "メールアドレスを確認してください。" };
    if (email.data !== row.email) newEmail = email.data;
  }

  try {
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        ...(newEmail ? { email: newEmail, emailVerifiedAt: null } : {}),
      })
      .where(eq(users.id, actor.userId));
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
      return { error: "このメールアドレスは、ほかのアカウントで使われています。" };
    }
    throw err;
  }
  if (newEmail) await sendVerificationMail(actor.userId, newEmail);

  redirect(newEmail ? "/?email=sent" : "/");
}
