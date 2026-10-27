"use client";

import { useEffect, useState } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/modules/core/shared/ui/form";
import type { Bilingual, ExamContent } from "../content";
import { formatSeconds, passCount, scoreTest, shuffle, type Scored } from "../logic";
import { T, mark, usePrefs } from "./text";
import { CHIP, OxButtons, QuestionBody, SECTION_TITLE, Verdict } from "./ui";

// 模擬テスト: 本番と同じ問題数・時間。答えは最後にまとめて採点する(採点と記録はサーバー)。

export type TestState = {
  kind: "random" | "past";
  round: number | null;
  label: Bilingual;
  ids: string[];
  answers: (boolean | null)[];
  i: number;
  startedAt: number;
  endAt: number;
  confirm: boolean;
  done: (Scored & { saved: "saving" | "saved" | "error" }) | null;
};

export type TestSubmit = (t: TestState) => void;

export function startTest(
  content: ExamContent,
  kind: "random" | "past",
  ids: string[],
  label: Bilingual,
  round: number | null = null,
): TestState {
  const now = Date.now();
  return {
    kind,
    round,
    label,
    ids,
    answers: ids.map(() => null),
    i: 0,
    startedAt: now,
    endAt: now + content.written.minutes * 60_000,
    confirm: false,
    done: null,
  };
}

/** 採点(画面の表示用。記録するときはサーバーが採点し直す)。 */
export function finishLocally(content: ExamContent, t: TestState): TestState {
  const answerOf = new Map(content.questions.map((q) => [q.id, q.answer]));
  const scored = scoreTest(
    t.ids.map((q, k) => ({ q, a: t.answers[k] })),
    answerOf,
    content.written.passRatio,
  );
  return { ...t, done: { ...scored, saved: "saving" } };
}

export function Test({
  content,
  sets,
  test,
  setTest,
  onFinish,
  onStudyWeak,
}: {
  content: ExamContent;
  sets: Map<number, string[]>;
  test: TestState | null;
  setTest: (t: TestState | null) => void;
  onFinish: TestSubmit;
  onStudyWeak: () => void;
}) {
  const { lang } = usePrefs();
  const w = content.written;
  const count = Math.min(w.count, content.questions.length);
  if (!test) {
    return (
      <div className="flex flex-col gap-6">
        <section className="bg-bg01 flex flex-col gap-4 p-5 md:p-8">
          <p className="text-brand03 text-xs font-bold">
            <T ja="本番と同じ形" vi="Như thi thật" inline />
          </p>
          <h2 className="text-brand01 text-2xl font-bold">
            <T ja="模擬テスト" vi="Thi thử" />
          </h2>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              { k: { ja: "問題数", vi: "Số câu" }, v: String(count) },
              { k: { ja: "時間", vi: "Thời gian" }, v: `${w.minutes}:00` },
              {
                k: { ja: "合格", vi: "Điểm đạt" },
                v: `${passCount(count, w.passRatio)}/${count}`,
              },
            ].map((x) => (
              <div key={x.k.ja} className="bg-white px-2 py-3">
                <dt className="text-brand04 text-xs">
                  <T {...x.k} />
                </dt>
                <dd className="font-heading text-brand01 text-2xl font-bold">{x.v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-brand04 text-sm">
            <T
              ja={`正解の数が ${Math.round(w.passRatio * 100)}% 以上(${count} 問中 ${passCount(count, w.passRatio)} 問)で合格です。答えは全部終わってから出ます。結果は記録に残ります。`}
              vi={`Đúng từ ${Math.round(w.passRatio * 100)}% (${passCount(count, w.passRatio)}/${count} câu) là đạt. Đáp án hiện sau khi nộp bài. Kết quả sẽ được lưu lại.`}
            />
          </p>
          <div>
            <button
              type="button"
              className={`${BUTTON_PRIMARY} px-8 py-3 text-base`}
              onClick={() =>
                setTest(
                  startTest(content, "random", shuffle(content.questions.map((q) => q.id)).slice(0, count), {
                    ja: "ランダム",
                    vi: "Ngẫu nhiên",
                  }),
                )
              }
            >
              <T ja={`ランダムに ${count} 問ではじめる`} vi={`Bắt đầu ${count} câu ngẫu nhiên`} inline />
            </button>
          </div>
        </section>
        <section className="flex flex-col gap-3">
          <h3 className={SECTION_TITLE}>
            <T ja="過去問をそのまま解く" vi="Làm nguyên một đề cũ" />
          </h3>
          <div className="flex flex-wrap gap-2">
            {[...sets.entries()].map(([r, ids]) => (
              <button
                key={r}
                type="button"
                className={CHIP}
                onClick={() =>
                  setTest(startTest(content, "past", ids.slice(), { ja: `第${r}回`, vi: `Đề số ${r}` }, r))
                }
              >
                {lang === "vi" ? `Đề ${r}` : `第${r}回`}
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }
  if (test.done) return <TestResult content={content} test={test} setTest={setTest} onStudyWeak={onStudyWeak} />;
  return <TestRunning content={content} test={test} setTest={setTest} onFinish={onFinish} />;
}

function TestRunning({
  content,
  test,
  setTest,
  onFinish,
}: {
  content: ExamContent;
  test: TestState;
  setTest: (t: TestState) => void;
  onFinish: TestSubmit;
}) {
  const [now, setNow] = useState(() => Date.now());
  const left = test.endAt - now;
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    // 時間切れは、その時点の答えで採点する。
    if (left <= 0) onFinish(test);
  }, [left, onFinish, test]);

  const q = content.questions.find((x) => x.id === test.ids[test.i]);
  const answered = test.answers.filter((a) => a !== null).length;
  const rest = test.ids.length - answered;
  if (!q) return null;
  const go = (i: number) => setTest({ ...test, i, confirm: false });

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-brand01 flex items-center justify-between gap-3 px-4 py-2 text-white">
        <span className="text-sm font-bold">
          <T {...test.label} inline />
        </span>
        <span
          className={`font-heading text-xl font-bold ${left < 5 * 60_000 ? "text-brand03 bg-white px-2" : ""}`}
          role="timer"
        >
          {formatSeconds(left / 1000)}
        </span>
        <span className="font-heading text-sm">
          {answered}/{test.ids.length}
        </span>
      </div>
      <nav aria-label="問題番号 / Số câu" className="grid grid-cols-10 gap-1">
        {test.ids.map((_, k) => (
          <button
            key={k}
            type="button"
            onClick={() => go(k)}
            aria-current={k === test.i ? "true" : undefined}
            className={`font-heading h-8 text-sm font-bold ${
              k === test.i
                ? "bg-brand03 text-white"
                : test.answers[k] !== null
                  ? "bg-brand01 text-white"
                  : "bg-field text-brand04"
            }`}
          >
            {k + 1}
          </button>
        ))}
      </nav>
      <QuestionBody q={q} label={`No.${test.i + 1}`} />
      <OxButtons
        picked={test.answers[test.i]}
        onPick={(a) => {
          const answers = test.answers.slice();
          answers[test.i] = a;
          setTest({
            ...test,
            answers,
            i: Math.min(test.i + 1, test.ids.length - 1),
            confirm: false,
          });
        }}
      />
      <div className="flex justify-between gap-3">
        <button type="button" className={BUTTON_SECONDARY} disabled={test.i === 0} onClick={() => go(test.i - 1)}>
          ← <T ja="前" vi="Trước" inline />
        </button>
        {test.i + 1 < test.ids.length ? (
          <button type="button" className={BUTTON_SECONDARY} onClick={() => go(test.i + 1)}>
            <T ja="次" vi="Tiếp" inline /> →
          </button>
        ) : null}
      </div>
      <div className="border-field flex flex-col items-center gap-3 border-t pt-4">
        {test.confirm ? (
          <>
            <p className="text-brand03 text-center font-bold">
              <T
                ja={`まだ ${rest} 問こたえていません。おわりにしますか?`}
                vi={`Còn ${rest} câu chưa trả lời. Nộp bài?`}
              />
            </p>
            <div className="flex gap-3">
              <button type="button" className={BUTTON_PRIMARY} onClick={() => onFinish(test)}>
                <T ja="おわりにする" vi="Nộp bài" inline />
              </button>
              <button type="button" className={BUTTON_SECONDARY} onClick={() => setTest({ ...test, confirm: false })}>
                <T ja="つづける" vi="Làm tiếp" inline />
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className={BUTTON_PRIMARY}
            onClick={() => (rest ? setTest({ ...test, confirm: true }) : onFinish(test))}
          >
            <T ja="採点する" vi="Nộp bài & chấm điểm" inline />
          </button>
        )}
      </div>
    </div>
  );
}

function TestResult({
  content,
  test,
  setTest,
  onStudyWeak,
}: {
  content: ExamContent;
  test: TestState;
  setTest: (t: TestState | null) => void;
  onStudyWeak: () => void;
}) {
  const { lang } = usePrefs();
  const r = test.done!;
  return (
    <div className="flex flex-col gap-6">
      <section className="bg-bg01 flex flex-col items-center gap-3 px-4 py-8 text-center">
        <p className="text-brand03 text-sm font-bold">
          <T ja="模擬テスト" vi="Thi thử" inline /> ・ <T {...test.label} inline />
        </p>
        <p className="font-heading text-brand01 text-6xl font-bold">
          {r.score}
          <small className="text-brand04 text-xl">{lang === "vi" ? " điểm" : " 点"}</small>
        </p>
        <p className={`px-4 py-1 text-lg font-bold text-white ${r.passed ? "bg-brand01" : "bg-brand03"}`}>
          <T {...(r.passed ? { ja: "合格ライン", vi: "Đạt" } : { ja: "もう少し", vi: "Chưa đạt" })} inline />
        </p>
        <p className="text-brand04 text-sm">
          {r.correct} / {r.total} ・{" "}
          <T
            ja={`合格は ${passCount(r.total, content.written.passRatio)} 問以上`}
            vi={`Đạt khi đúng từ ${passCount(r.total, content.written.passRatio)} câu`}
            inline
          />
        </p>
        <p className="text-brand04 text-xs" aria-live="polite">
          {r.saved === "saving" ? (
            <T ja="記録しています…" vi="Đang lưu…" inline />
          ) : r.saved === "saved" ? (
            <T ja="記録しました。" vi="Đã lưu." inline />
          ) : (
            <span className="text-brand03 font-bold">
              <T
                ja="記録できませんでした。通信を確かめてください。"
                vi="Không lưu được. Hãy kiểm tra kết nối."
                inline
              />
            </span>
          )}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" className={BUTTON_PRIMARY} onClick={() => setTest(null)}>
            <T ja="もう一度" vi="Thi lại" inline />
          </button>
          <button type="button" className={BUTTON_SECONDARY} onClick={onStudyWeak}>
            <T ja="間違えた問題を学習" vi="Học lại câu đã sai" inline />
          </button>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h3 className={SECTION_TITLE}>
          <T ja="答え合わせ" vi="Xem đáp án" />
        </h3>
        <ol className="flex flex-col gap-4">
          {test.ids.map((id, k) => {
            const q = content.questions.find((x) => x.id === id);
            if (!q) return null;
            const a = test.answers[k];
            return (
              <li key={id} className="flex flex-col gap-2">
                <QuestionBody
                  q={q}
                  label={`No.${k + 1} ・ ${lang === "vi" ? "Bạn" : "あなた"}: ${a === null ? "—" : mark(a)}`}
                />
                <Verdict correct={a === q.answer} answer={q.answer} explainJa={q.explainJa} explainVi={q.explainVi} />
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
