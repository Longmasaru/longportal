"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { requireActor } from "../access";
import { writeAuditLog } from "../audit";
import { PG_UNIQUE_VIOLATION, pgErrorCode } from "../shared/db-errors";
import { normalizeLoginId } from "./input-checks";
import { hashPassword, verifyPassword } from "./password";
import { newPasswordSchema } from "./password-policy";
import {
  consumeToken,
  findResettableUser,
  recentTokenCount,
  sendPasswordResetMail,
  sendVerificationMail,
} from "./recovery";
import { RESET_MAIL_LIMIT_PER_HOUR, emailSchema, tokenSchema } from "./recovery-policy";
import { users } from "./schema";
import { clearLoginFailures } from "./throttle";
import { MAX_LOGIN_ID_LENGTH, MAX_LOGIN_PASSWORD_LENGTH } from "./throttle-policy";

// パスワード再設定・メールアドレスの Server Action(docs/DESIGN.md 26 章)。

export type RecoveryFormState = { error?: string; success?: string } | undefined;

/** 「パスワードを忘れた方」。ID の有無・メールの有無にかかわらず、同じ案内を返す。 */
export async function requestPasswordResetAction(
  _prev: RecoveryFormState,
  formData: FormData,
): Promise<RecoveryFormState> {
  const loginId = normalizeLoginId(String(formData.get("loginId") ?? ""));
  if (!loginId) return { error: "ログイン ID を入力してください。" };
  const done = {
    success:
      "ログイン ID に確認済みのメールアドレスが登録されていれば、再設定の案内を送りました。メールが届かない場合は、管理者に連絡してください。",
  };
  if (loginId.length > MAX_LOGIN_ID_LENGTH) return done;

  const user = await findResettableUser(loginId);
  if (user && (await recentTokenCount(user.id, "password_reset")) < RESET_MAIL_LIMIT_PER_HOUR) {
    await sendPasswordResetMail(user.id, user.email, user.loginId);
  }
  return done;
}

const resetSchema = z.object({
  token: tokenSchema,
  newPassword: newPasswordSchema,
  confirmPassword: z.string(),
});

/** メールのリンクから、新しいパスワードを決める。 */
export async function resetPasswordWithTokenAction(
  _prev: RecoveryFormState,
  formData: FormData,
): Promise<RecoveryFormState> {
  const parsed = resetSchema.safeParse({
    token: String(formData.get("token") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  const { token, newPassword, confirmPassword } = parsed.data;
  if (newPassword !== confirmPassword) return { error: "新しいパスワードが一致しません。" };
  const passwordHash = await hashPassword(newPassword);

  const loginId = await db.transaction(async (tx) => {
    const used = await consumeToken(tx, token, "password_reset");
    if (!used) return null;
    const [user] = await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(users.id, used.userId))
      .returning({ loginId: users.loginId });
    if (!user) return null;
    await writeAuditLog(tx, {
      actorUserId: used.userId,
      action: "user.password_reset_self",
      targetType: "user",
      targetId: used.userId,
      after: { via: "email" },
    });
    return user.loginId;
  });
  if (!loginId) return { error: "このリンクは使えません(期限切れ・使用済み)。もう一度「パスワードを忘れた方」からやり直してください。" };

  // 失敗の記録によるロックが残っていると、すぐにログインできないため、解除する。
  await clearLoginFailures(loginId);
  redirect("/login?reset=done");
}

const updateEmailSchema = z.object({
  email: emailSchema,
  currentPassword: z
    .string()
    .min(1, "現在のパスワードを入力してください。")
    .max(MAX_LOGIN_PASSWORD_LENGTH, "現在のパスワードが違います。"),
});

/** ログイン中に、メールアドレスを登録・変更する(今のパスワードが必要)。変えると未確認に戻し、確認メールを送る。 */
export async function updateEmailAction(_prev: RecoveryFormState, formData: FormData): Promise<RecoveryFormState> {
  const actor = await requireActor();
  const parsed = updateEmailSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    currentPassword: String(formData.get("currentPassword") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  const { email, currentPassword } = parsed.data;

  const [row] = await db
    .select({ passwordHash: users.passwordHash, email: users.email, verifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, actor.userId));
  if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
    return { error: "現在のパスワードが違います。" };
  }
  if (row.email === email && row.verifiedAt) return { success: "このメールアドレスは確認済みです。" };

  try {
    await db.update(users).set({ email, emailVerifiedAt: null }).where(eq(users.id, actor.userId));
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
      return { error: "このメールアドレスは、ほかのアカウントで使われています。" };
    }
    throw err;
  }
  await sendVerificationMail(actor.userId, email);
  return { success: `${email} に確認のメールを送りました。メールのリンクを開くと、確認が完了します。` };
}

/** 確認メールを送り直す(登録済み・未確認のアドレスへ。1 時間 3 回まで)。 */
export async function resendVerificationAction(): Promise<RecoveryFormState> {
  const actor = await requireActor();
  const [row] = await db
    .select({ email: users.email, verifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, actor.userId));
  if (!row?.email) return { error: "メールアドレスが登録されていません。" };
  if (row.verifiedAt) return { success: "このメールアドレスは確認済みです。" };
  if ((await recentTokenCount(actor.userId, "email_verify")) >= RESET_MAIL_LIMIT_PER_HOUR) {
    return { error: "送り直しの回数が多すぎます。しばらく(1 時間ほど)待ってから、もう一度お試しください。" };
  }
  await sendVerificationMail(actor.userId, row.email);
  return { success: `${row.email} に確認のメールを送り直しました。` };
}
