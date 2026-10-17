"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type FormState } from "../actions";
import { FIELD_CLASS, LABEL_CLASS, Notice, SUBMIT_CLASS } from "./auth-shell";

export function LoginForm({ notice, info }: { notice?: string; info?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-5">
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {!state?.error && notice ? <Notice tone="error">{notice}</Notice> : null}
      {!state?.error && info ? <Notice tone="info">{info}</Notice> : null}

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
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label htmlFor="password" className={LABEL_CLASS}>
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={FIELD_CLASS}
        />
      </div>
      <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
        {pending ? "ログイン中…" : "ログイン"}
      </button>
      <Link
        href="/forgot-password"
        className="text-brand01 hover:text-brand03 text-center text-sm font-bold transition-colors"
      >
        パスワードを忘れた方
      </Link>
    </form>
  );
}
