"use client";

import type { ReactNode } from "react";
import type { Question } from "../content";
import { Explain, Sentence, T, mark } from "./text";

// 練習の画面で共通の部品。

export const imageUrl = (id: string) => `/apps/kentei/images/${id}`;

export const SECTION_TITLE = "text-brand01 text-lg font-bold";
export const CHIP =
  "border-brand01/30 text-brand01 hover:border-brand03 hover:text-brand03 aria-pressed:bg-brand01 aria-pressed:border-brand01 aria-pressed:text-white border bg-white px-3 py-1.5 text-sm font-bold transition-colors";

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "ng"; children: ReactNode }) {
  const style = {
    neutral: "bg-field text-brand04",
    ok: "bg-brand01 text-white",
    ng: "bg-brand03 text-white",
  }[tone];
  return (
    <span className={`inline-block min-w-6 px-1.5 text-center text-xs leading-5 font-bold ${style}`}>{children}</span>
  );
}

export function Meter({ ratio, tone = "brand01" }: { ratio: number; tone?: "brand01" | "brand03" | "brand04" }) {
  const color = {
    brand01: "bg-brand01",
    brand03: "bg-brand03",
    brand04: "bg-brand04",
  }[tone];
  return (
    <span className="bg-field block h-1.5 w-full overflow-hidden" aria-hidden>
      <span
        className={`${color} block h-full`}
        style={{
          width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`,
        }}
      />
    </span>
  );
}

/** 問題の文と図。 */
export function QuestionBody({ q, label }: { q: Pick<Question, "ja" | "kanji" | "vi" | "image">; label?: ReactNode }) {
  return (
    <article className="border-brand01/15 flex flex-col gap-3 border bg-white p-4 md:p-6">
      {label ? <p className="text-brand03 text-xs font-bold">{label}</p> : null}
      <Sentence ja={q.ja} kanji={q.kanji} vi={q.vi} big />
      {q.image ? (
        <figure className="bg-field flex justify-center p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl(q.image)} alt="図 / Hình" className="max-h-72 w-auto max-w-full object-contain" />
        </figure>
      ) : null}
    </article>
  );
}

/**
 * ○(正しい)・×(誤り)のボタン。
 * reveal を渡すと答え合わせの表示(正解に濃紺、選んだ誤りにオレンジ)にして、押せなくする。
 */
export function OxButtons({
  picked,
  reveal,
  onPick,
}: {
  picked: boolean | null;
  /** 正解(答え合わせのとき)。 */
  reveal?: boolean;
  onPick: (a: boolean) => void;
}) {
  const shown = reveal !== undefined;
  return (
    <div className="grid grid-cols-2 gap-3">
      {[true, false].map((a) => {
        let style = "border-brand01 text-brand01 bg-white hover:border-brand03 hover:text-brand03";
        if (shown) {
          if (a === reveal) style = "border-brand01 bg-brand01 text-white";
          else if (a === picked) style = "border-brand03 bg-brand03 text-white";
          else style = "border-field text-brand04 bg-white opacity-60";
        } else if (a === picked) style = "border-brand01 bg-brand01 text-white";
        return (
          <button
            key={String(a)}
            type="button"
            disabled={shown}
            aria-pressed={a === picked}
            onClick={() => onPick(a)}
            className={`${style} flex flex-col items-center gap-1 border-2 px-3 py-4 font-bold transition-colors`}
          >
            <span className="font-heading text-4xl leading-none">{mark(a)}</span>
            <span className="text-sm">
              <T {...(a ? { ja: "正しい", vi: "Đúng" } : { ja: "誤り", vi: "Sai" })} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 答え合わせの結果と解説。 */
export function Verdict({
  correct,
  answer,
  explainJa,
  explainVi,
  sources,
  children,
}: {
  correct: boolean;
  answer: boolean;
  explainJa: string;
  explainVi: string;
  sources?: string[];
  children?: ReactNode;
}) {
  return (
    <section
      aria-live="polite"
      className={`flex flex-col gap-3 border-l-4 bg-white p-4 ${correct ? "border-brand01" : "border-brand03"}`}
    >
      <p className={`flex flex-wrap items-baseline gap-3 font-bold ${correct ? "text-brand01" : "text-brand03"}`}>
        <span className="text-lg">
          <T {...(correct ? { ja: "正解!", vi: "Chính xác!" } : { ja: "不正解", vi: "Chưa đúng" })} inline />
        </span>
        <span className="text-brand04 text-sm">
          <T ja="答え" vi="Đáp án" inline />: {mark(answer)}
        </span>
      </p>
      <Explain ja={explainJa} vi={explainVi} />
      {sources?.length ? <p className="text-brand04 text-xs">{sourceLabel(sources)}</p> : null}
      {children}
    </section>
  );
}

export function sourceLabel(sources: readonly string[]): string {
  return sources
    .map((s) => {
      const [r, n] = s.split("-");
      return `第${r}回-${n}`;
    })
    .join("・");
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-brand01 hover:text-brand03 text-sm font-bold">
      ← <T ja="もどる" vi="Quay lại" inline />
    </button>
  );
}
