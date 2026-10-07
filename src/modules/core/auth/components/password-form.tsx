"use client";

import Link from "next/link";
import { useActionState } from "react";
import { changePasswordAction, type FormState } from "../actions";
import { MIN_PASSWORD_LENGTH } from "../password-policy";
import { FIELD_CLASS, LABEL_CLASS, Notice, SUBMIT_CLASS } from "./auth-shell";

export function PasswordForm({ forced }: { forced: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    changePasswordAction,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      {forced ? (
        <Notice tone="info">
          初回ログインのため、パスワードの変更が必要です。新しいパスワードを設定してください。
        </Notice>
      ) : null}
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}

      <div>
        <label htmlFor="currentPassword" className={LABEL_CLASS}>
          現在のパスワード
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label htmlFor="newPassword" className={LABEL_CLASS}>
          新しいパスワード
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          className={FIELD_CLASS}
        />
        <p className="text-brand04 mt-1 text-xs">{MIN_PASSWORD_LENGTH}文字以上で入力してください。</p>
      </div>
      <div>
        <label htmlFor="confirmPassword" className={LABEL_CLASS}>
          新しいパスワード(確認)
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className={FIELD_CLASS}
        />
      </div>
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
