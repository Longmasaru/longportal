"use client";

import { useState, useTransition } from "react";
import { DictationButton } from "../../shared/ui/dictation";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "../../shared/ui/form";
import { polishNoticeAction } from "../actions";
import { NOTICE_POLISH_MIN } from "../constants";

const SMALL =
  "border-brand01/30 text-brand01 hover:border-brand03 hover:text-brand03 inline-flex items-center gap-1.5 border bg-white px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50";

/**
 * お知らせの本文の「音声入力」と「AIで整える」(docs/DESIGN.md 23.1)。
 * 音声入力は話した言葉を本文の最後に足す。AI は案を見せるだけで、「この案を使う」を押したときだけ入れ替える
 * (入れ替えたあとは「元に戻す」で戻せる)。目安箱・人事管理と同じ形。
 */
export function BodyAssist({
  title,
  body,
  onChange,
  max,
}: {
  title: string;
  body: string;
  onChange: (next: string) => void;
  max: number;
}) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function polish() {
    setError(null);
    setSuggestion(null);
    startTransition(async () => {
      const result = await polishNoticeAction({ title, body });
      if ("error" in result) setError(result.error);
      else setSuggestion(result.text);
    });
  }

  function addSpoken(text: string) {
    const sep = body === "" || body.endsWith("\n") ? "" : "\n";
    onChange(`${body}${sep}${text}`.slice(0, max));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <DictationButton onText={addSpoken} />
        <button type="button" onClick={polish} disabled={pending || body.trim().length < NOTICE_POLISH_MIN} className={SMALL}>
          <span aria-hidden>✨</span>
          {pending ? "整えています…" : "AIで整える"}
        </button>
        {previous !== null && suggestion === null ? (
          <button
            type="button"
            onClick={() => {
              onChange(previous);
              setPrevious(null);
            }}
            className="text-brand04 hover:text-brand03 text-sm font-bold transition-colors"
          >
            元に戻す
          </button>
        ) : (
          <span className="text-brand04 text-xs">誤字や音声入力の聞き間違いを直し、読みやすくします。</span>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-brand03 text-sm font-bold">
          {error}
        </p>
      ) : null}
      {suggestion !== null ? (
        <div className="border-brand01/20 bg-bg01 flex flex-col gap-3 border p-3" aria-live="polite">
          <p className="text-brand01 text-xs font-bold tracking-widest">AI の案(まだ入っていません)</p>
          <p className="text-ink text-sm leading-relaxed whitespace-pre-wrap">{suggestion}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPrevious(body);
                onChange(suggestion.slice(0, max));
                setSuggestion(null);
              }}
              className={BUTTON_PRIMARY}
            >
              この案を使う
            </button>
            <button type="button" onClick={() => setSuggestion(null)} className={BUTTON_SECONDARY}>
              使わない
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
