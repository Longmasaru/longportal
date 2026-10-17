"use client";

import { useActionState, useState } from "react";
import { formatDateDot } from "@/modules/core/shared/format";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD_CLASS,
  LABEL_CLASS,
  StatusTag,
} from "@/modules/core/shared/ui/form";
import { createRecordAction, deleteRecordAction, updateRecordAction } from "../actions";
import {
  BODY_MAX,
  RECORD_KINDS,
  RECORD_KIND_LABEL,
  RECORD_VISIBILITIES,
  RECORD_VISIBILITY_LABEL,
  TITLE_MAX,
  type RecordKind,
} from "../labels";
import type { HrRecord, RecordFormState } from "../types";

const KIND_TONE: Record<RecordKind, "neutral" | "info" | "attention" | "muted"> = {
  talk: "neutral",
  caution: "attention",
  praise: "info",
  transfer: "muted",
};

export function KindTag({ kind }: { kind: RecordKind }) {
  return <StatusTag tone={KIND_TONE[kind]}>{RECORD_KIND_LABEL[kind]}</StatusTag>;
}

/** 記録の追加・編集フォーム(管理する人だけに出す)。 */
export function RecordForm({
  employeeId,
  record,
  today,
  onDone,
}: {
  employeeId: string;
  record?: HrRecord;
  today: string;
  onDone?: () => void;
}) {
  const empty = { kind: "talk", occurredOn: today, title: "", body: "", visibility: "employee" };
  const [values, setValues] = useState(
    record
      ? { kind: record.kind, occurredOn: record.occurredOn, title: record.title, body: record.body, visibility: record.visibility }
      : empty,
  );
  const [state, action, pending] = useActionState<RecordFormState, FormData>(async (prev, formData) => {
    const result = await (record ? updateRecordAction : createRecordAction)(prev, formData);
    if (result?.ok) {
      if (!record) setValues(empty);
      onDone?.();
    }
    return result;
  }, undefined);
  const idPrefix = record ? `record-${record.id}` : "record-new";
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <form action={action} className="flex flex-col gap-4">
      {record ? <input type="hidden" name="id" value={record.id} /> : <input type="hidden" name="employeeId" value={employeeId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className={LABEL_CLASS}>種類</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {RECORD_KINDS.map((k) => (
              <label key={k} className="text-brand01 flex items-center gap-1.5 text-sm">
                <input type="radio" name="kind" value={k} checked={values.kind === k} onChange={set("kind")} className="size-4" />
                {RECORD_KIND_LABEL[k]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${idPrefix}-date`} className={LABEL_CLASS}>
            日付
          </label>
          <input
            id={`${idPrefix}-date`}
            type="date"
            name="occurredOn"
            required
            value={values.occurredOn}
            onChange={set("occurredOn")}
            className={FIELD_CLASS}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-title`} className={LABEL_CLASS}>
          件名
        </label>
        <input
          id={`${idPrefix}-title`}
          name="title"
          required
          maxLength={TITLE_MAX}
          value={values.title}
          onChange={set("title")}
          placeholder="例: 半期の面談、検査記録の書き漏れ、新人への丁寧な指導"
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-body`} className={LABEL_CLASS}>
          内容
        </label>
        <textarea
          id={`${idPrefix}-body`}
          name="body"
          rows={4}
          maxLength={BODY_MAX}
          value={values.body}
          onChange={set("body")}
          placeholder="話したこと、注意した内容、ほめた点など"
          className={`${FIELD_CLASS} resize-y`}
        />
      </div>
      <fieldset>
        <legend className={LABEL_CLASS}>公開範囲</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {RECORD_VISIBILITIES.map((v) => (
            <label key={v} className="text-brand01 flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="visibility"
                value={v}
                checked={values.visibility === v}
                onChange={set("visibility")}
                className="size-4"
              />
              {RECORD_VISIBILITY_LABEL[v]}
            </label>
          ))}
        </div>
        <p className="text-brand04 mt-1 text-xs">「管理者だけのメモ」は、本人のページには出ません。</p>
      </fieldset>
      {state?.error ? (
        <p role="alert" className="text-brand03 text-sm font-bold">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "保存中…" : record ? "保存" : "記録を追加"}
        </button>
        {record ? (
          <button type="button" onClick={onDone} className={BUTTON_SECONDARY}>
            やめる
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** 「＋ 記録を追加」を押したときだけ、追加のフォームを開く(31.2)。 */
export function NewRecordPanel({ employeeId, today }: { employeeId: string; today: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${BUTTON_PRIMARY} self-start`}>
        ＋ 記録を追加
      </button>
    );
  }
  return (
    <section aria-labelledby="hr-new" className="border-brand01/15 flex flex-col gap-3 border bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="hr-new" className="text-brand01 text-lg font-bold">
          記録を追加
        </h2>
        <button type="button" onClick={() => setOpen(false)} className={BUTTON_SECONDARY}>
          閉じる
        </button>
      </div>
      <RecordForm employeeId={employeeId} today={today} onDone={() => setOpen(false)} />
    </section>
  );
}

function DeleteButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<RecordFormState, FormData>(deleteRecordAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("この記録を削除しますか?(元に戻せません)")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="text-brand04 hover:text-brand03 font-bold transition-colors">
        {pending ? "削除中…" : "削除"}
      </button>
      {state?.error ? <span className="text-brand03 ml-2 text-xs">{state.error}</span> : null}
    </form>
  );
}

function RecordItem({
  record,
  editable,
  employeeId,
  today,
}: {
  record: HrRecord;
  editable: boolean;
  employeeId: string;
  today: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className="border-brand01/15 border bg-white p-4">
        <RecordForm employeeId={employeeId} record={record} today={today} onDone={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className="border-brand01/15 flex flex-col gap-2 border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-heading text-brand01 font-bold tabular-nums">{formatDateDot(record.occurredOn)}</span>
        <KindTag kind={record.kind} />
        {editable && record.visibility === "managers" ? <StatusTag tone="muted">管理者だけのメモ</StatusTag> : null}
      </div>
      <p className="text-brand01 font-bold">{record.title}</p>
      {record.body ? <p className="text-brand01 text-sm leading-relaxed whitespace-pre-wrap">{record.body}</p> : null}
      <div className="text-brand04 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>記録した人: {record.authorName ?? record.authorLoginId ?? "(不明)"}</span>
        {editable ? (
          <span className="flex items-center gap-4">
            <button type="button" onClick={() => setEditing(true)} className="text-brand01 hover:text-brand03 font-bold transition-colors">
              編集
            </button>
            <DeleteButton id={record.id} />
          </span>
        ) : null}
      </div>
    </li>
  );
}

/** 記録の一覧(新しい順)。editable は管理する人の見え方のときだけ。 */
export function RecordList({
  records,
  editable,
  employeeId,
  today,
}: {
  records: HrRecord[];
  editable: boolean;
  employeeId: string;
  today: string;
}) {
  if (records.length === 0) {
    return <p className="border-brand01/15 text-brand04 border-y py-10 text-center text-sm">まだ記録がありません。</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {records.map((r) => (
        <RecordItem key={`${r.id}-${r.updatedAt.valueOf()}`} record={r} editable={editable} employeeId={employeeId} today={today} />
      ))}
    </ul>
  );
}
