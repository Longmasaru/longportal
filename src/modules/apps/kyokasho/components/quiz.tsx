"use client";

import { useEffect, useState } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/modules/core/shared/ui/form";
import type { QuizQuestion } from "../content";

// 章の終わりの理解度チェックテスト。答え合わせは画面の中だけで行い、前回の点数はこの端末のブラウザにだけ保存する
// (サーバーには送らない。保存のキーには、ログイン中のユーザー ID を含める。docs/DESIGN.md 30 章)。

type Last = { score: number; total: number; at: string };

function loadLast(key: string): Last | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Last;
  } catch {
    // 保存できない環境(プライベートモードなど)では、記録なしで使う。
  }
  return null;
}

export function Quiz({ questions, storageKey }: { questions: QuizQuestion[]; storageKey: string }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const [last, setLast] = useState<Last | null>(null);

  useEffect(() => {
    // 前回の点数は、ブラウザでの表示後に読み込む(サーバーの描画と食い違わないように)。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLast(loadLast(storageKey));
  }, [storageKey]);

  const answeredAll = questions.every((_, i) => answers[i]);
  const score = questions.filter((q, i) => answers[i] === q.answer).length;

  function check() {
    setChecked(true);
    const record: Last = { score, total: questions.length, at: new Date().toISOString() };
    setLast(record);
    try {
      localStorage.setItem(storageKey, JSON.stringify(record));
    } catch {
      // 保存できなくても、答え合わせはできる。
    }
  }

  function retry() {
    setAnswers({});
    setChecked(false);
  }

  return (
    <div className="border-brand01/15 bg-bg01 flex flex-col gap-5 border p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-brand01 font-bold">
          テスト(全 {questions.length} 問)
        </p>
        {last ? (
          <p className="text-brand04 text-xs">
            前回: {last.score} / {last.total} 問 正解({new Date(last.at).toLocaleDateString("ja-JP")})
          </p>
        ) : null}
      </div>

      <ol className="flex flex-col gap-5">
        {questions.map((q, i) => {
          const chosen = answers[i];
          const correct = chosen === q.answer;
          return (
            <li key={i} className="flex flex-col gap-2 bg-white p-4">
              <fieldset className="flex flex-col gap-2" disabled={checked}>
                <legend className="text-brand01 mb-1 font-bold [word-break:auto-phrase]">
                  <span className="text-brand03 mr-2">{q.no}</span>
                  {q.question}
                </legend>
                {q.options.map((o) => {
                  const isAnswer = checked && o.label === q.answer;
                  const isWrongPick = checked && o.label === chosen && !correct;
                  return (
                    <label
                      key={o.label}
                      className={`flex cursor-pointer items-start gap-2 border px-3 py-2 text-sm ${
                        isAnswer
                          ? "border-link bg-bg01 font-bold"
                          : isWrongPick
                            ? "border-brand03 bg-brand03/10"
                            : "border-brand01/15"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${storageKey}-${i}`}
                        value={o.label}
                        checked={chosen === o.label}
                        onChange={() => setAnswers((prev) => ({ ...prev, [i]: o.label }))}
                        className="accent-brand01 mt-1"
                      />
                      <span className="text-brand01">
                        <span className="mr-1 font-bold">{o.label}.</span>
                        {o.text}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              {checked ? (
                <div className="text-brand01 text-sm leading-relaxed">
                  <p className={`font-bold ${correct ? "text-link" : "text-brand03"}`}>
                    {correct ? "正解" : chosen ? `不正解(正解は ${q.answer})` : `未回答(正解は ${q.answer})`}
                  </p>
                  {q.explanation ? <p className="mt-1">{q.explanation}</p> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {checked ? (
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-brand01 text-lg font-bold" role="status">
            {score} / {questions.length} 問 正解
            {score === questions.length ? " 全問正解です!" : ""}
          </p>
          <button type="button" onClick={retry} className={BUTTON_SECONDARY}>
            もう一度解く
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={check} disabled={!answeredAll} className={BUTTON_PRIMARY}>
            答え合わせ
          </button>
          {!answeredAll ? <p className="text-brand04 text-xs">すべての問題に答えると、答え合わせができます。</p> : null}
        </div>
      )}
    </div>
  );
}
