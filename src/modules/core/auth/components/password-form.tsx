"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { changePasswordAction, type FormState } from "../actions";
import { newPasswordChecks } from "../input-checks";
import { MIN_PASSWORD_LENGTH } from "../password-policy";
import { FIELD_CLASS, LABEL_CLASS, Notice, SUBMIT_CLASS } from "./auth-shell";
import { ErrorDetails } from "./error-details";
import { PasswordChecklist, PasswordInput } from "./password-input";
import { UsernameForPasswordManager } from "./username-field";

/**
 * パスワードの変更。requireEmail のとき(初回ログイン・メール未登録)は、メールアドレスの登録も必須にする
 * (パスワードを忘れたときの連絡先。docs/DESIGN.md 26 章)。
 * askCurrentPassword が false のとき(初回ログインの直後)は、現在のパスワードの欄を出さない。
 */
export function PasswordForm({
  loginId,
  forced,
  askCurrentPassword,
  requireEmail,
  currentEmail,
}: {
  loginId: string;
  forced: boolean;
  askCurrentPassword: boolean;
  requireEmail: boolean;
  currentEmail: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    changePasswordAction,
    undefined,
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState(currentEmail ?? "");

  return (
    <form action={action} className="flex flex-col gap-5">
      <UsernameForPasswordManager loginId={loginId} />
      {forced ? (
        <Notice tone="info">
          初回ログインのため、パスワードの変更と、メールアドレスの登録が必要です。
        </Notice>
      ) : null}
      {state?.error ? (
        <Notice tone="error">
          <ErrorDetails error={state.error} hints={state.hints} />
        </Notice>
      ) : null}

      {askCurrentPassword ? (
        <div>
          <label htmlFor="currentPassword" className={LABEL_CLASS}>
            {forced ? "現在のパスワード(配られた初期パスワード)" : "現在のパスワード"}
          </label>
          <PasswordInput
            id="currentPassword"
            name="currentPassword"
            autoComplete="current-password"
            required
            value={currentPassword}
            onValueChange={setCurrentPassword}
          />
        </div>
      ) : null}
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
        <PasswordChecklist
          checks={newPasswordChecks(newPassword, confirmPassword, askCurrentPassword ? currentPassword : undefined)}
        />
      </div>
      {requireEmail ? (
        <div>
          <label htmlFor="email" className={LABEL_CLASS}>
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="text-brand04 mt-1 text-xs">
            パスワードを忘れたときに、再設定の案内が届きます。登録すると確認のメールが届くので、リンクを開いてください。
          </p>
        </div>
      ) : null}
      <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
        {pending ? "変更中…" : "パスワードを変更"}
      </button>
      {!forced ? (
        <Link href="/" className="text-brand01 hover:text-brand03 text-center text-sm font-bold transition-colors">
          キャンセルしてホームへ戻る
        </Link>
      ) : null}
    </form>
  );
}
