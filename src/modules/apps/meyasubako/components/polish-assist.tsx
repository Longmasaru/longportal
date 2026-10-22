"use client";

import { useState, useTransition } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/modules/core/shared/ui/form";
import { polishAction } from "../actions";
import { POLISH_MIN, type MeyasubakoCategory } from "../constants";

/**
 * 「AIで整える」(docs/DESIGN.md 42 章)。書きかけの文を AI に整えてもらい、案を見てから「この案を使う」で入れ替える。
 * 入れ替えたあとは「元に戻す」で戻せる。教科書のツッコミ(32 章)と同じ形。
 */
export function PolishAssist({
  purpose,
  category = null,
  text,
  onChange,
  max,
}: {
  purpose: "post" | "reply";
  category?: MeyasubakoCategory | null;
  text: string;
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
      const result = await polishAction({ purpose, category, body: text });
      if ("error" in result) setError(result.error);
      else setSuggestion(result.text);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={polish}
          disabled={pending || text.trim().length < POLISH_MIN}
          className="border-brand01/30 text-brand01 hover:border-brand03 hover:text-brand03 inline-flex items-center gap-1.5 border bg-white px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50"
        >
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
                setPrevious(text);
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
