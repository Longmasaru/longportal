"use client";

import { useRouter } from "next/navigation";
import { Fragment, useActionState, useRef, useState, useTransition } from "react";
import { DictationButton } from "@/modules/core/shared/ui/dictation";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, FormNotice, LABEL_CLASS } from "@/modules/core/shared/ui/form";
import { deleteDraftAction, saveReportAction, sortMemoAction } from "../actions";
import {
  FIELD_DEF,
  FIELD_MAX,
  MEMO_MAX,
  MEMO_MIN,
  SCORE_MAX,
  SCORE_MIN,
  SCORE_NOTE_MAX,
  TEXT_FIELDS,
  type ReportStatus,
  type TextField,
} from "../labels";
import { mergeSorted, type ReportFields } from "../logic";
import { manifest } from "../manifest";
import type { FormState } from "../types";

const SMALL =
  "border-brand01/30 text-brand01 hover:border-brand03 hover:text-brand03 inline-flex items-center gap-1.5 border bg-white px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50";

const SCORES = Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, (_, i) => SCORE_MIN + i);

/** 章ごとに項目をまとめる(画面の見出し)。 */
const SECTIONS = TEXT_FIELDS.reduce<{ section: string; fields: TextField[] }[]>((acc, f) => {
  const section = FIELD_DEF[f].section;
  const last = acc.at(-1);
  if (last && last.section === section) last.fields.push(f);
  else acc.push({ section, fields: [f] });
  return acc;
}, []);

/**
 * 録音の文字起こし・メモを貼って、AI で日報の項目に振り分ける。
 * 案は画面に出すだけで、「項目に入れる」を押したときだけ入力欄に足す(書いてある項目は消さずに後ろに足す)。
 */
function MemoAssist({ onApply }: { onApply: (sorted: Partial<ReportFields>) => void }) {
  const [memo, setMemo] = useState("");
  const [result, setResult] = useState<Partial<ReportFields> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const memoRef = useRef(memo);

  function sort() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const r = await sortMemoAction(memo);
      if ("error" in r) setError(r.error);
      else setResult(r.fields);
    });
  }

  return (
    <details className="border-brand01/20 bg-brand01/5 border p-4">
      <summary className="text-brand01 cursor-pointer text-sm font-bold">
        <span aria-hidden>✨ </span>メモや録音の文字起こしから、AI で下書きを作る
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-brand04 text-xs">
          1 日のメモや、録音を文字にしたものを貼ってください。AI が日報の項目に振り分けた案を出します(このメモの文章だけを AI に送ります)。保存はされません。
        </p>
        <textarea
          aria-label="メモ・文字起こし"
          rows={6}
          maxLength={MEMO_MAX}
          value={memo}
          onChange={(e) => {
            setMemo(e.target.value);
            memoRef.current = e.target.value;
          }}
          className={`${FIELD_CLASS} resize-y`}
        />
        <div className="flex flex-wrap items-start gap-2">
          <DictationButton
            onText={(t) => {
              memoRef.current = `${memoRef.current}${t}`;
              setMemo(memoRef.current);
            }}
          />
          <button type="button" onClick={sort} disabled={pending || memo.trim().length < MEMO_MIN} className={SMALL}>
            {pending ? "振り分けています…" : "AIで項目に振り分ける"}
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-brand03 text-sm font-bold">
            {error}
          </p>
        ) : null}
        {result ? (
          <div className="border-brand01/20 flex flex-col gap-3 border bg-white p-3" aria-live="polite">
            <p className="text-brand01 text-xs font-bold tracking-widest">AI の案(まだ入力欄には入っていません)</p>
            <dl className="flex flex-col gap-2">
              {TEXT_FIELDS.filter((f) => result[f]).map((f) => (
                <div key={f}>
                  <dt className="text-brand04 text-xs font-bold">{FIELD_DEF[f].label}</dt>
                  <dd className="text-brand01 text-sm whitespace-pre-wrap">{result[f]}</dd>
                </div>
              ))}
              {result.score != null || result.scoreNote ? (
                <div>
                  <dt className="text-brand04 text-xs font-bold">今日の点数</dt>
                  <dd className="text-brand01 text-sm">
                    {result.score != null ? `${result.score}/10 ` : ""}
                    {result.scoreNote ?? ""}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onApply(result);
                  setResult(null);
                }}
                className={BUTTON_PRIMARY}
              >
                項目に入れる
              </button>
              <button type="button" onClick={() => setResult(null)} className={BUTTON_SECONDARY}>
                使わない
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

/** 自分の日報の入力欄(下書き保存・提出)。 */
export function ReportForm({
  reportDate,
  today,
  initial,
  status,
  reportId,
}: {
  reportDate: string;
  today: string;
  initial: ReportFields;
  status: ReportStatus | null;
  reportId: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ReportFields>(initial);
  const valuesRef = useRef(values);
  const [undo, setUndo] = useState<ReportFields | null>(null);
  const update = (next: ReportFields) => {
    valuesRef.current = next;
    setValues(next);
  };
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await saveReportAction(prev, formData);
    if (result?.ok && result.savedAs === "submitted" && result.reportId) router.push(`${manifest.route}/${result.reportId}`);
    return result;
  }, undefined);
  const [deleteState, deleteAction, deleting] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await deleteDraftAction(prev, formData);
    if (result?.ok) router.push(`${manifest.route}?tab=mine`);
    return result;
  }, undefined);
  const submitted = status === "submitted";

  return (
    <div className="flex flex-col gap-6">
      <MemoAssist
        onApply={(sorted) => {
          setUndo(valuesRef.current);
          update(mergeSorted(valuesRef.current, sorted));
        }}
      />
      {undo ? (
        <p className="text-brand04 -mt-4 text-sm">
          AI の案を入れました。
          <button
            type="button"
            onClick={() => {
              update(undo);
              setUndo(null);
            }}
            className="text-brand01 hover:text-brand03 ml-2 font-bold transition-colors"
          >
            元に戻す
          </button>
        </p>
      ) : null}

      <form action={action} className="flex flex-col gap-6">
        <input type="hidden" name="reportDate" value={reportDate} />
        {SECTIONS.map(({ section, fields }) => (
          <Fragment key={section}>
          <fieldset className="border-brand01/15 flex flex-col gap-4 border-t pt-4">
            <legend className="text-brand01 pr-2 text-base font-bold">{section}</legend>
            {fields.map((f) => {
              const def = FIELD_DEF[f];
              const id = `nippo-${f}`;
              return (
                <div key={f}>
                  {fields.length > 1 || def.label !== section.replace(/^\d+\.\s*/, "") ? (
                    <label htmlFor={id} className={LABEL_CLASS}>
                      {def.label}
                      {f === "training" ? <span className="bg-brand03 ml-2 px-1 text-xs font-normal text-white">必須</span> : null}
                    </label>
                  ) : (
                    <label htmlFor={id} className="sr-only">
                      {def.label}
                    </label>
                  )}
                  <textarea
                    id={id}
                    name={f}
                    rows={def.rows}
                    maxLength={FIELD_MAX}
                    value={values[f]}
                    placeholder={def.placeholder}
                    onChange={(e) => update({ ...valuesRef.current, [f]: e.target.value })}
                    className={`${FIELD_CLASS} resize-y`}
                  />
                  <div className="mt-1.5 flex">
                    <DictationButton
                      onText={(t) => update({ ...valuesRef.current, [f]: `${valuesRef.current[f]}${t}` })}
                    />
                  </div>
                </div>
              );
            })}
          </fieldset>
            {section.startsWith("5.") ? (
              <fieldset className="border-brand01/15 flex flex-col gap-4 border-t pt-4">
                <legend className="text-brand01 pr-2 text-base font-bold">6. コンディション</legend>
                <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                  <div>
                    <label htmlFor="nippo-score" className={LABEL_CLASS}>
                      今日の点数
                    </label>
                    <select
                      id="nippo-score"
                      name="score"
                      value={values.score ?? ""}
                      onChange={(e) => update({ ...valuesRef.current, score: e.target.value ? Number(e.target.value) : null })}
                      className={FIELD_CLASS}
                    >
                      <option value="">選ぶ</option>
                      {SCORES.map((s) => (
                        <option key={s} value={s}>
                          {s} / 10
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="nippo-score-note" className={LABEL_CLASS}>
                      その理由・一言
                    </label>
                    <input
                      id="nippo-score-note"
                      name="scoreNote"
                      maxLength={SCORE_NOTE_MAX}
                      value={values.scoreNote}
                      onChange={(e) => update({ ...valuesRef.current, scoreNote: e.target.value })}
                      className={FIELD_CLASS}
                    />
                  </div>
                </div>
              </fieldset>
            ) : null}
          </Fragment>
        ))}

        {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
        {state?.ok && state.savedAs === "draft" ? <FormNotice tone="success">下書きを保存しました。</FormNotice> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" name="intent" value="submit" disabled={pending} className={BUTTON_PRIMARY}>
            {submitted ? "更新する" : "提出する"}
          </button>
          {!submitted ? (
            <button type="submit" name="intent" value="draft" disabled={pending} className={BUTTON_SECONDARY}>
              下書き保存
            </button>
          ) : null}
          {pending ? <span className="text-brand04 text-sm">保存しています…</span> : null}
          {reportDate !== today ? <span className="text-brand04 text-sm">※ 今日ではない日の日報です。</span> : null}
        </div>
      </form>

      {reportId && !submitted ? (
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm("この下書きを消しますか?")) e.preventDefault();
          }}
          className="border-brand01/15 border-t pt-4"
        >
          <input type="hidden" name="id" value={reportId} />
          <button type="submit" disabled={deleting} className="text-brand04 hover:text-brand03 text-sm font-bold transition-colors">
            この下書きを消す
          </button>
          {deleteState?.error ? <FormNotice tone="error">{deleteState.error}</FormNotice> : null}
        </form>
      ) : null}
    </div>
  );
}
