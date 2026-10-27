"use client";

import { useState } from "react";
import { FIELD_CLASS } from "@/modules/core/shared/ui/form";
import type { Bilingual, ExamContent } from "../content";
import { toRomaji } from "../romaji";
import { T, VI_FONT, usePrefs } from "./text";
import { CHIP, SECTION_TITLE } from "./ui";

// 用語集: 道具・機械・材料の名前と意味。関連する問題をそのまま学習できる。

export function Glossary({
  content,
  onStudy,
}: {
  content: ExamContent;
  onStudy: (ids: string[], title: Bilingual) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("*");
  const p = usePrefs();
  const q = query.trim().toLowerCase();
  const terms = content.glossary.filter(
    (t) =>
      (category === "*" || t.category === category) &&
      (!q || [t.kanji, t.yomi, t.vi, t.descJa, t.descVi].join(" ").toLowerCase().includes(q)),
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className={SECTION_TITLE}>
        <T ja="用語集" vi="Từ vựng" inline />
      </h2>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="さがす / Tìm kiếm"
        aria-label="さがす / Tìm kiếm"
        className={`${FIELD_CLASS} ${VI_FONT}`}
      />
      <div className="flex flex-wrap gap-2">
        {[{ key: "*", ja: "すべて", vi: "Tất cả" }, ...content.categories].map((c) => (
          <button
            key={c.key}
            type="button"
            className={CHIP}
            aria-pressed={category === c.key}
            onClick={() => setCategory(c.key)}
          >
            {p.lang === "vi" ? c.vi : c.ja}
          </button>
        ))}
      </div>
      {terms.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {terms.map((t) => (
            <article key={t.kanji} className="border-brand01/15 flex flex-col gap-2 border bg-white p-4">
              <header>
                <h3
                  className={`text-brand01 text-lg font-bold ${p.showJa ? "" : VI_FONT}`}
                  lang={p.showJa ? undefined : "vi"}
                >
                  {p.showJa ? t.kanji : t.vi}
                </h3>
                {p.showJa && t.yomi ? (
                  <p className="text-brand04 text-sm">
                    {t.yomi}
                    {p.romaji ? (
                      <span className={`${VI_FONT} ml-2 italic`}>{toRomaji(t.yomi.replace(/[(（].*?[)）]/g, ""))}</span>
                    ) : null}
                  </p>
                ) : null}
                {p.showJa && p.showVi && t.vi ? (
                  <p lang="vi" className={`${VI_FONT} text-brand03 text-sm font-bold`}>
                    {t.vi}
                  </p>
                ) : null}
              </header>
              {p.showJa && t.descJa ? <p className="text-ink text-sm leading-relaxed">{t.descJa}</p> : null}
              {p.showVi && t.descVi ? (
                <p
                  lang="vi"
                  className={`${VI_FONT} text-sm leading-relaxed ${p.showJa ? "border-brand01/20 text-brand01 border-l-2 pl-2" : "text-ink"}`}
                >
                  {t.descVi}
                </p>
              ) : null}
              {t.questions.length ? (
                <button
                  type="button"
                  onClick={() =>
                    onStudy(t.questions, {
                      ja: `用語「${t.kanji}」の問題`,
                      vi: `Câu hỏi về “${t.vi || t.kanji}”`,
                    })
                  }
                  className="text-brand01 hover:text-brand03 self-start text-sm font-bold"
                >
                  <T
                    ja={`関連する問題を解く(${t.questions.length})`}
                    vi={`Làm câu liên quan (${t.questions.length})`}
                    inline
                  />{" "}
                  →
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="text-brand04 text-sm">
          <T ja="見つかりません。" vi="Không tìm thấy." />
        </p>
      )}
    </div>
  );
}
