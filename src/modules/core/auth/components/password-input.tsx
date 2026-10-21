"use client";

import { useState, type ComponentProps, type KeyboardEvent } from "react";
import { passwordInputWarnings, type NewPasswordCheck } from "../input-checks";
import { FIELD_CLASS } from "./auth-shell";

type Props = Omit<ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * パスワードの入力欄。右の目のマークで、入力した文字を表示・非表示に切り替えられる(既定は非表示)。
 * Caps Lock がオンのときと、全角の文字・前後の空白が入っているときは、欄の下に注意を出す。
 * 値は親が持つ(送信して戻ってきたときに、入力が消えないようにするため)。
 */
export function PasswordInput({ value, onValueChange, id, className, ...rest }: Props) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const warnings = passwordInputWarnings(value);
  const notes = capsLock ? ["Caps Lock がオンです(英字が大文字になります)。", ...warnings] : warnings;
  const noteId = `${id}-notes`;

  const watchCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState("CapsLock"));

  return (
    <div>
      <div className="relative">
        <input
          {...rest}
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={watchCaps}
          onKeyUp={watchCaps}
          onBlur={() => setCapsLock(false)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={notes.length ? noteId : undefined}
          className={`${FIELD_CLASS} pr-11 ${className ?? ""}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "パスワードを隠す" : "パスワードを表示する"}
          aria-pressed={visible}
          aria-controls={id}
          title={visible ? "パスワードを隠す" : "パスワードを表示する"}
          className="text-brand04 hover:text-brand01 focus-visible:outline-brand01 absolute inset-y-0 right-0 flex w-11 items-center justify-center transition-colors focus-visible:outline-2"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {notes.length ? (
        <ul id={noteId} aria-live="polite" className="text-brand03 mt-1 flex flex-col gap-0.5 text-xs font-bold">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** 新しいパスワードの条件の一覧(満たしたものに印が付く)。 */
export function PasswordChecklist({ checks }: { checks: NewPasswordCheck[] }) {
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5 text-xs" aria-label="新しいパスワードの条件">
      {checks.map((c) => (
        <li key={c.label} className={`flex items-center gap-1.5 ${c.ok ? "text-link font-bold" : "text-brand04"}`}>
          <span aria-hidden="true" className="w-3 text-center">
            {c.ok ? "✓" : "・"}
          </span>
          {c.label}
          <span className="sr-only">{c.ok ? "(満たしています)" : "(まだです)"}</span>
        </li>
      ))}
    </ul>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M10.6 5.1A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.6C3.7 8.5 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" strokeLinejoin="round" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" strokeLinecap="round" />
    </svg>
  );
}
