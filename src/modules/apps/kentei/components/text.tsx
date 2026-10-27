"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Bilingual } from "../content";
import { toRomaji } from "../romaji";

// 表示の言語の切り替え(日本語とベトナム語の両方 / 日本語だけ / ベトナム語だけ)と、漢字・ローマ字の添え書き。
// 設定はこの端末のブラウザにだけ保存する(ログイン中のユーザーごと。docs/DESIGN.md 43 章)。

export type Lang = "both" | "ja" | "vi";
export type Prefs = { lang: Lang; kanji: boolean; romaji: boolean };
export const DEFAULT_PREFS: Prefs = {
  lang: "both",
  kanji: false,
  romaji: false,
};

const PrefsContext = createContext<Prefs>(DEFAULT_PREFS);

export function PrefsProvider({ prefs, children }: { prefs: Prefs; children: ReactNode }) {
  return <PrefsContext.Provider value={prefs}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs & { showJa: boolean; showVi: boolean } {
  const p = useContext(PrefsContext);
  return { ...p, showJa: p.lang !== "vi", showVi: p.lang !== "ja" };
}

/** ベトナム語の文字(声調記号)が欠けないよう、和文の書体ではなく端末の標準の書体で出す。 */
export const VI_FONT = "[font-family:system-ui,-apple-system,Segoe_UI,Roboto,Helvetica,Arial,sans-serif]";

/** 画面の言葉(見出し・ボタン)。両方のときは、ベトナム語を小さく下に添える。 */
export function T({ ja, vi, inline = false }: Bilingual & { inline?: boolean }) {
  const { lang } = usePrefs();
  if (lang === "ja") return <>{ja}</>;
  if (lang === "vi")
    return (
      <span lang="vi" className={VI_FONT}>
        {vi}
      </span>
    );
  return (
    <>
      <span>{ja}</span>
      <span lang="vi" className={`${VI_FONT} ${inline ? "ml-1.5" : "block"} text-[0.8em] font-normal opacity-75`}>
        {vi}
      </span>
    </>
  );
}

/** 片方の言語の言葉だけ(短いラベル用。両方のときは日本語)。 */
export function useWord() {
  const { lang } = usePrefs();
  return (o: Bilingual) => (lang === "vi" ? o.vi : o.ja);
}

/** 試験と同じ ひらがなの文。設定に合わせて、ローマ字・漢字まじり・ベトナム語を添える。 */
export function Sentence({
  ja,
  kanji,
  vi,
  big = false,
  preferKanji = false,
}: {
  ja: string;
  kanji?: string;
  vi?: string;
  big?: boolean;
  /** 実技の手順など、漢字を表示に切り替えるとき、ひらがなの代わりに漢字まじりを出す。 */
  preferKanji?: boolean;
}) {
  const p = usePrefs();
  const size = big ? "text-lg md:text-xl leading-relaxed" : "leading-relaxed";
  return (
    <div className="flex flex-col gap-1">
      {p.showJa ? (
        <>
          <p className={`text-ink ${size} font-bold tracking-wide`}>{preferKanji && p.kanji && kanji ? kanji : ja}</p>
          {p.romaji ? <p className={`${VI_FONT} text-brand04 text-sm italic`}>{toRomaji(ja)}</p> : null}
          {p.kanji && kanji && !preferKanji ? <p className="text-brand04 text-sm">{kanji}</p> : null}
        </>
      ) : null}
      {p.showVi && vi ? (
        <p lang="vi" className={`${VI_FONT} ${p.showJa ? "text-brand01 text-sm" : `text-ink ${size} font-bold`}`}>
          {vi}
        </p>
      ) : null}
    </div>
  );
}

/** 解説(日本語・ベトナム語)。 */
export function Explain({ ja, vi }: { ja: string; vi: string }) {
  const p = usePrefs();
  return (
    <div className="flex flex-col gap-1.5 text-sm leading-relaxed">
      {p.showJa && ja ? <p className="text-ink">{ja}</p> : null}
      {p.showVi && vi ? (
        <p
          lang="vi"
          className={`${VI_FONT} ${p.showJa ? "border-brand01/20 text-brand01 border-l-2 pl-2" : "text-ink"}`}
        >
          {vi}
        </p>
      ) : null}
    </div>
  );
}

export const mark = (a: boolean) => (a ? "○" : "×");
