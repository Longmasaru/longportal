"use client";

import { useState } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/modules/core/shared/ui/form";
import type { Bilingual, ExamContent } from "../content";
import { isMastered, shuffle, weakIds, type QuestionStat } from "../logic";
import { Explain, Sentence, T, mark, usePrefs } from "./text";
import {
  BackButton,
  CHIP,
  Meter,
  OxButtons,
  Pill,
  QuestionBody,
  SECTION_TITLE,
  Verdict,
  imageUrl,
  sourceLabel,
} from "./ui";

// 学習モード: 分野・過去問の回・間違えた問題から 1 問ずつ。答えるとすぐに答えと解説が出る。

export type StudySession = {
  ids: string[];
  i: number;
  ok: number;
  title: Bilingual;
  round?: number;
  /** 今の問題で選んだ答え(まだなら null)。 */
  answered: boolean | null;
};

export function newSession(ids: string[], title: Bilingual, round?: number): StudySession {
  return { ids, i: 0, ok: 0, title, round, answered: null };
}

export const WEAK_TITLE: Bilingual = { ja: "間違えた問題", vi: "Câu đã sai" };

export function Study({
  content,
  sets,
  stats,
  session,
  setSession,
  onAnswer,
}: {
  content: ExamContent;
  sets: Map<number, string[]>;
  stats: Record<string, QuestionStat>;
  session: StudySession | null;
  setSession: (s: StudySession | null) => void;
  onAnswer: (questionId: string, answer: boolean) => void;
}) {
  const [shuffled, setShuffled] = useState(true);
  const [list, setList] = useState(false);
  const { lang } = usePrefs();
  const ids = content.questions.map((q) => q.id);
  const weak = weakIds(ids, stats);

  if (session) return <StudyQuestion content={content} session={session} setSession={setSession} onAnswer={onAnswer} />;
  if (list) return <QuestionList content={content} onBack={() => setList(false)} />;

  const start = (picked: string[], title: Bilingual) =>
    setSession(newSession(shuffled ? shuffle(picked) : picked, title));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE}>
          <T ja="分野をえらぶ" vi="Chọn chủ đề" />
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => start(ids, { ja: "すべて", vi: "Tất cả" })}
            className="bg-brand01 flex items-center justify-between gap-3 px-4 py-3 text-left font-bold text-white hover:opacity-90"
          >
            <span>
              <T ja="すべての問題" vi="Tất cả câu hỏi" />
            </span>
            <span className="font-heading text-sm">
              {ids.length}
              {lang === "vi" ? " câu" : " 問"}
            </span>
          </button>
          {content.categories.map((c) => {
            const qs = content.questions.filter((q) => q.category === c.key);
            const m = qs.filter((q) => isMastered(stats[q.id])).length;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() =>
                  start(
                    qs.map((q) => q.id),
                    c,
                  )
                }
                className="border-brand01/20 hover:border-brand03 flex flex-col gap-2 border bg-white px-4 py-3 text-left transition-colors"
              >
                <span className="text-brand01 flex items-start justify-between gap-3 font-bold">
                  <span>
                    <T ja={c.ja} vi={c.vi} />
                  </span>
                  <span className="font-heading text-brand04 shrink-0 text-xs">
                    {m}/{qs.length}
                  </span>
                </span>
                <Meter ratio={qs.length ? m / qs.length : 0} />
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={!weak.length}
            onClick={() => setSession(newSession(shuffle(weak), WEAK_TITLE))}
            className={weak.length ? BUTTON_PRIMARY : BUTTON_SECONDARY}
          >
            <T ja="間違えた問題" vi="Câu đã sai" inline />{" "}
            <Pill tone={weak.length ? "ng" : "neutral"}>{weak.length}</Pill>
          </button>
          <label className="text-brand01 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={shuffled}
              onChange={(e) => setShuffled(e.target.checked)}
              className="size-4"
            />
            <T ja="順番をシャッフル" vi="Xáo trộn thứ tự" inline />
          </label>
        </div>
        <p className="text-brand04 text-xs">
          <T
            ja="続けて 2 回正解すると「おぼえた」になります。"
            vi="Trả lời đúng 2 lần liên tiếp thì được tính là “đã thuộc”."
          />
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE}>
          <T ja="過去問の回ごと" vi="Theo từng đề cũ" />
        </h2>
        <div className="flex flex-wrap gap-2">
          {[...sets.keys()].map((r) => (
            <button
              key={r}
              type="button"
              className={CHIP}
              onClick={() =>
                setSession(newSession(sets.get(r)!.slice(), { ja: `過去問 第${r}回`, vi: `Đề cũ số ${r}` }, r))
              }
            >
              {lang === "vi" ? `Đề ${r}` : `第${r}回`}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={SECTION_TITLE}>
          <T ja="一覧で見る(指導用)" vi="Xem danh sách (cho người hướng dẫn)" />
        </h2>
        <p className="text-brand04 text-sm">
          <T ja="全部の問題と答え・解説を一覧で表示します。" vi="Hiển thị toàn bộ câu hỏi kèm đáp án và giải thích." />
        </p>
        <div>
          <button type="button" className={BUTTON_SECONDARY} onClick={() => setList(true)}>
            <T ja="一覧をひらく" vi="Mở danh sách" inline />
          </button>
        </div>
      </section>
    </div>
  );
}

function StudyQuestion({
  content,
  session,
  setSession,
  onAnswer,
}: {
  content: ExamContent;
  session: StudySession;
  setSession: (s: StudySession | null) => void;
  onAnswer: (questionId: string, answer: boolean) => void;
}) {
  const { lang } = usePrefs();
  if (session.i >= session.ids.length) {
    return (
      <section className="bg-bg01 flex flex-col items-center gap-4 px-4 py-10 text-center">
        <p className="text-brand03 text-sm font-bold">
          <T {...session.title} inline />
        </p>
        <p className="font-heading text-brand01 text-5xl font-bold">
          {session.ok}
          <small className="text-brand04 text-xl"> / {session.ids.length}</small>
        </p>
        <p className="text-brand01">
          <T ja="おつかれさまでした。" vi="Bạn đã làm tốt lắm!" />
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className={BUTTON_PRIMARY}
            onClick={() =>
              setSession(newSession(session.round ? session.ids : shuffle(session.ids), session.title, session.round))
            }
          >
            <T ja="もう一度" vi="Làm lại" inline />
          </button>
          <button type="button" className={BUTTON_SECONDARY} onClick={() => setSession(null)}>
            <T ja="学習のメニュー" vi="Về menu học" inline />
          </button>
        </div>
      </section>
    );
  }

  const q = content.questions.find((x) => x.id === session.ids[session.i]);
  if (!q) return null;
  const category = content.categories.find((c) => c.key === q.category);
  const answered = session.answered;
  const last = session.i + 1 >= session.ids.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <BackButton onClick={() => setSession(null)} />
        <span className="font-heading text-brand04 text-sm">
          {session.round ? `第${session.round}回 No.${session.i + 1}` : ""} {session.i + 1} / {session.ids.length}
        </span>
      </div>
      <Meter ratio={session.i / session.ids.length} />
      <QuestionBody q={q} label={category ? (lang === "vi" ? category.vi : category.ja) : undefined} />
      <OxButtons
        picked={answered}
        reveal={answered === null ? undefined : q.answer}
        onPick={(a) => {
          onAnswer(q.id, a);
          setSession({
            ...session,
            answered: a,
            ok: session.ok + (a === q.answer ? 1 : 0),
          });
        }}
      />
      {answered !== null ? (
        <Verdict
          correct={answered === q.answer}
          answer={q.answer}
          explainJa={q.explainJa}
          explainVi={q.explainVi}
          sources={q.sources}
        >
          <div>
            <button
              type="button"
              autoFocus
              className={BUTTON_PRIMARY}
              onClick={() => {
                setSession({ ...session, i: session.i + 1, answered: null });
                window.scrollTo({ top: 0 });
              }}
            >
              <T {...(last ? { ja: "おわり", vi: "Kết thúc" } : { ja: "次へ", vi: "Tiếp" })} inline /> →
            </button>
          </div>
        </Verdict>
      ) : null}
    </div>
  );
}

function QuestionList({ content, onBack }: { content: ExamContent; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <BackButton onClick={onBack} />
      <h2 className={SECTION_TITLE}>
        <T ja="全部の問題" vi="Toàn bộ câu hỏi" inline />{" "}
        <span className="text-brand04 font-heading text-sm">{content.questions.length}</span>
      </h2>
      {content.categories.map((c) => (
        <section key={c.key} className="flex flex-col gap-3">
          <h3 className="text-brand01 border-brand01/20 border-b pb-1 font-bold">
            <T ja={c.ja} vi={c.vi} inline />
          </h3>
          <ol className="flex flex-col gap-3">
            {content.questions
              .filter((q) => q.category === c.key)
              .map((q) => (
                <li key={q.id} className="flex gap-3 bg-white p-3">
                  <span
                    className={`font-heading flex size-8 shrink-0 items-center justify-center text-lg font-bold text-white ${q.answer ? "bg-brand01" : "bg-brand03"}`}
                  >
                    {mark(q.answer)}
                  </span>
                  <div className="flex min-w-0 flex-col gap-2">
                    <Sentence ja={q.ja} kanji={q.kanji} vi={q.vi} />
                    {q.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl(q.image)}
                        alt="図 / Hình"
                        className="max-h-48 w-auto max-w-full self-start object-contain"
                      />
                    ) : null}
                    <Explain ja={q.explainJa} vi={q.explainVi} />
                    <p className="text-brand04 text-xs">{sourceLabel(q.sources)}</p>
                  </div>
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
