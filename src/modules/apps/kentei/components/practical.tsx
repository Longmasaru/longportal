"use client";

import { useEffect, useState } from "react";
import { BUTTON_PRIMARY } from "@/modules/core/shared/ui/form";
import type { Bilingual, Practical as PracticalContent } from "../content";
import { toRomaji } from "../romaji";
import { T, VI_FONT, Sentence, usePrefs } from "./text";
import { CHIP, OxButtons, Pill, QuestionBody, SECTION_TITLE, Verdict, imageUrl } from "./ui";

// 実技: 概要・製作図・作業の流れ・試験の注意・持ち物チェック・ルール確認の ○×。
// 持ち物のチェックは、この端末のブラウザにだけ保存する(記録には残さない)。ルール確認の ○× も記録しない。

const SECTIONS = [
  { id: "j-over", ja: "概要", vi: "Tổng quan" },
  { id: "j-draw", ja: "製作図", vi: "Bản vẽ" },
  { id: "j-steps", ja: "作業の流れ", vi: "Quy trình" },
  { id: "j-rules", ja: "試験の注意", vi: "Lưu ý" },
  { id: "j-bring", ja: "持ち物", vi: "Đồ mang theo" },
  { id: "j-quiz", ja: "ルールの確認 ○×", vi: "Kiểm tra quy định ○×" },
];

function loadChecks(key: string): Record<number, boolean> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Record<number, boolean>;
  } catch {
    // 保存できない環境でも、チェックはその場で使える。
  }
  return {};
}

function Both({ o }: { o: Bilingual }) {
  const p = usePrefs();
  return (
    <>
      {p.showJa ? <span>{o.ja}</span> : null}
      {p.showVi && o.vi ? (
        <span lang="vi" className={`${VI_FONT} ${p.showJa ? "text-brand01 block text-[0.9em]" : ""}`}>
          {o.vi}
        </span>
      ) : null}
    </>
  );
}

export function Practical({
  practical,
  passScore,
  storageKey,
}: {
  practical: PracticalContent;
  passScore: number;
  storageKey: string;
}) {
  const p = usePrefs();
  const [checks, setChecks] = useState<Record<number, boolean>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChecks(loadChecks(storageKey));
  }, [storageKey]);
  const saveChecks = (next: Record<number, boolean>) => {
    setChecks(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // 保存できなくても使える。
    }
  };
  const got = practical.bring.filter((_, k) => checks[k]).length;

  return (
    <div className="flex flex-col gap-10">
      <section className="bg-bg01 flex flex-col gap-2 p-5 md:p-8">
        <p className="text-brand03 text-xs font-bold">
          {practical.year} <T ja="実技試験" vi="Thi thực hành" inline />
        </p>
        <h2 className="text-brand01 text-2xl font-bold">
          <T ja="実技: 曲げの製品をつくる" vi="Thực hành: làm sản phẩm uốn" />
        </h2>
        <p className="text-brand04 text-sm">
          <T ja={`${passScore} 点以上(100 点満点)で合格です。`} vi={`Từ ${passScore} điểm (thang 100) là đạt.`} />
        </p>
      </section>

      <nav aria-label="目次 / Mục lục" className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={CHIP}>
            {p.lang === "vi" ? s.vi : s.ja}
          </a>
        ))}
      </nav>

      <section id="j-over" className="flex scroll-mt-4 flex-col gap-3">
        <h3 className={SECTION_TITLE}>
          <T ja="概要" vi="Tổng quan" />
        </h3>
        <dl className="divide-field flex flex-col divide-y bg-white">
          {practical.overview.map((o, k) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 p-3 text-sm md:grid-cols-[12rem_1fr]">
              <dt className="text-brand04 font-bold">
                <Both o={o.label} />
              </dt>
              <dd className="text-ink">
                <Both o={o.value} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {practical.drawing ? (
        <section id="j-draw" className="flex scroll-mt-4 flex-col gap-3">
          <h3 className={SECTION_TITLE}>
            <T ja="製作図" vi="Bản vẽ chế tạo" />
          </h3>
          <figure className="border-field flex justify-center border bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl(practical.drawing.image)}
              alt="製作図 / Bản vẽ"
              className="w-full max-w-3xl object-contain"
            />
          </figure>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
            {practical.drawing.notes.map((n, k) => (
              <li key={k} className="text-ink">
                <Both o={n} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section id="j-steps" className="flex scroll-mt-4 flex-col gap-3">
        <h3 className={SECTION_TITLE}>
          <T ja="作業の流れ" vi="Quy trình làm bài" />
        </h3>
        <ol className="flex flex-col gap-2">
          {practical.steps.map((s, k) => (
            <li key={k} className="flex gap-3 bg-white p-3">
              <span className="font-heading bg-brand01 flex size-7 shrink-0 items-center justify-center text-sm font-bold text-white">
                {k + 1}
              </span>
              <Sentence ja={s.ja} kanji={s.kanji} vi={s.vi} preferKanji />
            </li>
          ))}
        </ol>
      </section>

      <section id="j-rules" className="flex scroll-mt-4 flex-col gap-3">
        <h3 className={SECTION_TITLE}>
          <T ja="試験の注意" vi="Lưu ý khi thi" />
        </h3>
        <ol className="flex flex-col gap-2">
          {practical.rules.map((s, k) => (
            <li key={k} className={`flex gap-3 bg-white p-3 ${s.strong ? "border-brand03 border-l-4" : ""}`}>
              <span
                className={`font-heading w-6 shrink-0 text-sm font-bold ${s.strong ? "text-brand03" : "text-brand04"}`}
              >
                {k + 1}
              </span>
              <Sentence ja={s.ja} kanji={s.kanji} vi={s.vi} preferKanji />
            </li>
          ))}
        </ol>
      </section>

      <section id="j-bring" className="flex scroll-mt-4 flex-col gap-3">
        <h3 className={`${SECTION_TITLE} flex items-center gap-2`}>
          <T ja="持ち物チェック" vi="Kiểm tra đồ mang theo" inline />
          <Pill tone={got === practical.bring.length ? "ok" : "neutral"}>
            {got}/{practical.bring.length}
          </Pill>
        </h3>
        <ul className="divide-field flex flex-col divide-y bg-white">
          {practical.bring.map((b, k) => (
            <li key={k}>
              <label className="flex cursor-pointer items-start gap-3 p-3">
                <input
                  type="checkbox"
                  checked={!!checks[k]}
                  onChange={(e) => saveChecks({ ...checks, [k]: e.target.checked })}
                  className="mt-1 size-5 shrink-0"
                />
                <span className="flex min-w-0 flex-1 flex-col text-sm">
                  <span className="text-brand01 font-bold">
                    {p.showJa ? (
                      b.ja
                    ) : (
                      <span lang="vi" className={VI_FONT}>
                        {b.vi}
                      </span>
                    )}
                    {p.showJa && b.yomi ? (
                      <span className="text-brand04 ml-2 font-normal">
                        {b.yomi}
                        {p.romaji ? <span className={`${VI_FONT} ml-1.5 italic`}>{toRomaji(b.yomi)}</span> : null}
                      </span>
                    ) : null}
                    {b.required ? (
                      <span className="ml-2">
                        <Pill tone="ng">{p.lang === "vi" ? "Bắt buộc" : "必須"}</Pill>
                      </span>
                    ) : null}
                  </span>
                  {p.showJa && p.showVi && b.vi ? (
                    <span lang="vi" className={`${VI_FONT} text-brand01`}>
                      {b.vi}
                    </span>
                  ) : null}
                  {p.showJa && b.spec ? <span className="text-brand04 text-xs">{b.spec}</span> : null}
                </span>
                <span className="font-heading text-brand04 shrink-0 text-sm">{b.quantity}</span>
              </label>
            </li>
          ))}
        </ul>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {practical.bringNotes.map((n, k) => (
            <li key={k} className="text-ink">
              <Both o={n} />
            </li>
          ))}
        </ul>
        <div>
          <button
            type="button"
            className="text-brand01 hover:text-brand03 text-sm font-bold"
            onClick={() => saveChecks({})}
          >
            <T ja="チェックをはずす" vi="Bỏ chọn tất cả" inline />
          </button>
        </div>
        {practical.venue.length ? (
          <details className="bg-white p-3">
            <summary className="text-brand01 cursor-pointer text-sm font-bold">
              <T ja="試験場に用意されているもの" vi="Những thứ có sẵn tại phòng thi" inline />
            </summary>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {practical.venue.map((v, k) => (
                <li key={k}>
                  {p.showJa ? (
                    <>
                      <b className="text-brand01">{v.ja}</b> <span className="text-brand04">{v.spec}</span>
                    </>
                  ) : null}
                  {p.showVi && v.vi ? (
                    <span lang="vi" className={`${VI_FONT} ${p.showJa ? "text-brand01 block" : ""}`}>
                      {v.vi}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {practical.quiz.length ? (
        <section id="j-quiz" className="flex scroll-mt-4 flex-col gap-3">
          <h3 className={SECTION_TITLE}>
            <T ja="ルールの確認 ○×" vi="Kiểm tra quy định ○×" />
          </h3>
          <RuleQuiz quiz={practical.quiz} />
        </section>
      ) : null}
    </div>
  );
}

function RuleQuiz({ quiz }: { quiz: PracticalContent["quiz"] }) {
  const [state, setState] = useState({
    i: 0,
    picked: null as boolean | null,
    ok: 0,
  });
  if (state.i >= quiz.length) {
    return (
      <div className="bg-bg01 flex flex-col items-center gap-3 p-6">
        <p className="font-heading text-brand01 text-4xl font-bold">
          {state.ok}
          <small className="text-brand04 text-lg"> / {quiz.length}</small>
        </p>
        <button type="button" className={BUTTON_PRIMARY} onClick={() => setState({ i: 0, picked: null, ok: 0 })}>
          <T ja="もう一度" vi="Làm lại" inline />
        </button>
      </div>
    );
  }
  const q = quiz[state.i];
  return (
    <div className="flex flex-col gap-3">
      <p className="font-heading text-brand04 text-sm">
        {state.i + 1} / {quiz.length}
      </p>
      <QuestionBody q={q} />
      <OxButtons
        picked={state.picked}
        reveal={state.picked === null ? undefined : q.answer}
        onPick={(a) =>
          setState({
            ...state,
            picked: a,
            ok: state.ok + (a === q.answer ? 1 : 0),
          })
        }
      />
      {state.picked !== null ? (
        <Verdict correct={state.picked === q.answer} answer={q.answer} explainJa={q.explainJa} explainVi={q.explainVi}>
          <div>
            <button
              type="button"
              className={BUTTON_PRIMARY}
              onClick={() => setState({ ...state, i: state.i + 1, picked: null })}
            >
              <T ja="次へ" vi="Tiếp" inline /> →
            </button>
          </div>
        </Verdict>
      ) : null}
    </div>
  );
}
