"use client";

import Link from "next/link";
import { useActionState, useTransition, useState } from "react";
import { newPasswordChecks } from "../input-checks";
import { MIN_PASSWORD_LENGTH } from "../password-policy";
import {
  requestPasswordResetAction,
  resendVerificationAction,
  resetPasswordWithTokenAction,
  updateEmailAction,
  type RecoveryFormState,
} from "../recovery-actions";
import { FIELD_CLASS, LABEL_CLASS, Notice, SUBMIT_CLASS } from "./auth-shell";
import { PasswordChecklist, PasswordInput } from "./password-input";
import { UsernameForPasswordManager } from "./username-field";

const BACK_LINK = "text-brand01 hover:text-brand03 text-center text-sm font-bold transition-colors";

/** 「パスワードを忘れた方」: ログイン ID を入れると、確認済みのメールに再設定の案内が届く。 */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<RecoveryFormState, FormData>(requestPasswordResetAction, undefined);
  const [loginId, setLoginId] = useState("");
  return (
    <form action={action} className="flex flex-col gap-5">
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.success ? <Notice tone="info">{state.success}</Notice> : null}
      <p className="text-brand04 text-sm leading-relaxed">
        ログイン ID(社員番号)を入れてください。登録・確認済みのメールアドレスに、パスワードを再設定するリンクを送ります。
      </p>
      <div>
        <label htmlFor="loginId" className={LABEL_CLASS}>
          ログインID
        </label>
        <input
          id="loginId"
          name="loginId"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
        {pending ? "送信中…" : "再設定の案内を送る"}
      </button>
      <Link href="/login" className={BACK_LINK}>
        ログイン画面へ戻る
      </Link>
    </form>
  );
}

/** メールのリンクから開く、新しいパスワードの入力。 */
export function ResetPasswordForm({ token, loginId }: { token: string; loginId: string }) {
  const [state, action, pending] = useActionState<RecoveryFormState, FormData>(
    resetPasswordWithTokenAction,
    undefined,
  );
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  return (
    <form action={action} className="flex flex-col gap-5">
      <UsernameForPasswordManager loginId={loginId} />
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <p className="text-brand04 text-sm">ログインID: {loginId}</p>
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="newPassword" className={LABEL_CLASS}>
          新しいパスワード
        </label>
        <PasswordInput
          id="newPassword"
          name="newPassword"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          value={newPassword}
          onValueChange={setNewPassword}
        />
      </div>
      <div>
        <label htmlFor="confirmPassword" className={LABEL_CLASS}>
          新しいパスワード(確認)
        </label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onValueChange={setConfirmPassword}
        />
        <PasswordChecklist checks={newPasswordChecks(newPassword, confirmPassword)} />
      </div>
      <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
        {pending ? "変更中…" : "パスワードを変更"}
      </button>
    </form>
  );
}

/** ログイン中のメールアドレスの登録・変更と、確認メールの送り直し。 */
export function EmailSettingsForm({
  loginId,
  email,
  verified,
}: {
  loginId: string;
  email: string | null;
  verified: boolean;
}) {
  const [state, action, pending] = useActionState<RecoveryFormState, FormData>(updateEmailAction, undefined);
  const [resent, setResent] = useState<RecoveryFormState>(undefined);
  const [resending, startResend] = useTransition();
  const shown = resent ?? state;
  const [newEmail, setNewEmail] = useState(email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");

  return (
    <form action={action} className="flex flex-col gap-5">
      <UsernameForPasswordManager loginId={loginId} />
      {shown?.error ? <Notice tone="error">{shown.error}</Notice> : null}
      {shown?.success ? <Notice tone="info">{shown.success}</Notice> : null}
      <p className="text-brand04 text-sm leading-relaxed">
        {email
          ? verified
            ? `登録済み(確認済み): ${email}`
            : `登録済み(まだ確認されていません): ${email}`
          : "メールアドレスが登録されていません。パスワードを忘れたときのために、登録してください。"}
      </p>
      {email && !verified ? (
        <button
          type="button"
          disabled={resending}
          onClick={() => startResend(async () => setResent(await resendVerificationAction()))}
          className="border-brand01 text-brand01 hover:text-brand03 hover:border-brand03 w-full border bg-white py-2.5 text-sm font-bold transition-colors"
        >
          {resending ? "送信中…" : "確認のメールを送り直す"}
        </button>
      ) : null}
      <div>
        <label htmlFor="settingsEmail" className={LABEL_CLASS}>
          {email ? "新しいメールアドレス" : "メールアドレス"}
        </label>
        <input
          id="settingsEmail"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label htmlFor="settingsPassword" className={LABEL_CLASS}>
          現在のパスワード
        </label>
        <PasswordInput
          id="settingsPassword"
          name="currentPassword"
          autoComplete="current-password"
          required
          value={currentPassword}
          onValueChange={setCurrentPassword}
        />
      </div>
      <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
        {pending ? "保存中…" : "メールアドレスを保存"}
      </button>
    </form>
  );
}
