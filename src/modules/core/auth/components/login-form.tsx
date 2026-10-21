"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, type FormState } from "../actions";
import { FIELD_CLASS, LABEL_CLASS, Notice, SUBMIT_CLASS } from "./auth-shell";
import { ErrorDetails } from "./error-details";
import { PasswordInput } from "./password-input";

export function LoginForm({ notice, info }: { notice?: string; info?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, undefined);
  // 値はここで持つ(まちがえて戻ってきたときに、入力が消えないようにする)。
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");

  return (
    // Chrome などのパスワード保存は、この form(ID は autocomplete="username"、パスワードは current-password)を手がかりにする。
    <form action={action} className="flex flex-col gap-5">
      {state?.error ? (
        <Notice tone="error">
          <ErrorDetails error={state.error} hints={state.hints} />
        </Notice>
      ) : null}
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
          inputMode="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          aria-describedby="loginId-hint"
          className={FIELD_CLASS}
        />
        <p id="loginId-hint" className="text-brand04 mt-1 text-xs">
          社員番号です(例: 0123)。
        </p>
      </div>
      <div>
        <label htmlFor="password" className={LABEL_CLASS}>
          パスワード
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onValueChange={setPassword}
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
