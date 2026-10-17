"use client";

import { useActionState, useState, type ReactNode } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, LABEL_CLASS } from "@/modules/core/shared/ui/form";
import { addItemAction, deleteItemAction, saveAbilitiesAction, saveSectionAction } from "../sheet-actions";
import type { RecordFormState } from "../types";

/** フォームの項目(サーバーから渡せる形)。 */
export type FieldSpec = {
  name: string;
  label: string;
  type: "text" | "textarea" | "date" | "number" | "select";
  value?: string;
  options?: { value: string; label: string }[];
  /** 数字の欄の単位など */
  suffix?: string;
  required?: boolean;
  maxLength?: number;
  step?: string;
  /** 2 列の並びで、横幅いっぱいにする */
  wide?: boolean;
};

function Input({ field, idPrefix }: { field: FieldSpec; idPrefix: string }) {
  const id = `${idPrefix}-${field.name}`;
  const common = { id, name: field.name, defaultValue: field.value ?? "", required: field.required };
  let control: ReactNode;
  if (field.type === "textarea") {
    control = <textarea {...common} rows={4} maxLength={field.maxLength} className={`${FIELD_CLASS} resize-y`} />;
  } else if (field.type === "select") {
    control = (
      <select {...common} className={FIELD_CLASS}>
        {field.required ? null : <option value="">(未選択)</option>}
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <span className="flex items-center gap-2">
        <input
          {...common}
          type={field.type === "number" ? "text" : field.type}
          inputMode={field.type === "number" ? "decimal" : undefined}
          maxLength={field.maxLength}
          className={FIELD_CLASS}
        />
        {field.suffix ? <span className="text-brand04 shrink-0 text-sm">{field.suffix}</span> : null}
      </span>
    );
  }
  return (
    <div className={field.wide || field.type === "textarea" ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className={LABEL_CLASS}>
        {field.label}
      </label>
      {control}
    </div>
  );
}

function ErrorText({ state }: { state: RecordFormState }) {
  return state?.error ? (
    <p role="alert" className="text-brand03 text-sm font-bold">
      {state.error}
    </p>
  ) : null;
}

/**
 * 章のカード。見る表示(view)と、管理する人だけの「編集」(章の項目をまとめて保存)を切り替える。
 * fields を渡さなければ編集ボタンを出さない。section が "abilities" のときは能力の 5 項目を保存する。
 */
export function SectionCard({
  id,
  title,
  note,
  view,
  employeeId,
  section,
  fields,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  view: ReactNode;
  employeeId: string;
  section: string;
  fields?: FieldSpec[];
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<RecordFormState, FormData>(async (prev, formData) => {
    const result = await (section === "abilities" ? saveAbilitiesAction : saveSectionAction)(prev, formData);
    if (result?.ok) setEditing(false);
    return result;
  }, undefined);

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="border-brand01/15 flex scroll-mt-4 flex-col gap-4 border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-brand01 text-lg font-bold">
          {title}
        </h2>
        {note ? <span className="text-brand04 text-xs">{note}</span> : null}
        {fields && !editing ? (
          <button type="button" onClick={() => setEditing(true)} className={BUTTON_SECONDARY}>
            編集
          </button>
        ) : null}
      </div>
      {editing && fields ? (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="section" value={section} />
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <Input key={f.name} field={f} idPrefix={`${id}-edit`} />
            ))}
          </div>
          <ErrorText state={state} />
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
              {pending ? "保存中…" : "保存"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className={BUTTON_SECONDARY}>
              やめる
            </button>
          </div>
        </form>
      ) : (
        view
      )}
      {children}
    </section>
  );
}

/** 一覧(資格・スキル・研修・コンディション)に 1 行足すフォーム。 */
export function AddItemForm({
  employeeId,
  type,
  fields,
  label,
}: {
  employeeId: string;
  type: string;
  fields: FieldSpec[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState<RecordFormState, FormData>(async (prev, formData) => {
    const result = await addItemAction(prev, formData);
    if (result?.ok) setFormKey((k) => k + 1);
    return result;
  }, undefined);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-brand01 hover:text-brand03 self-start text-sm font-bold transition-colors">
        ＋ {label}
      </button>
    );
  }
  return (
    <form key={formKey} action={action} className="bg-bg01 flex flex-col gap-3 p-3">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="type" value={type} />
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <Input key={f.name} field={f} idPrefix={`add-${type}`} />
        ))}
      </div>
      <ErrorText state={state} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "追加中…" : "追加"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={BUTTON_SECONDARY}>
          閉じる
        </button>
      </div>
    </form>
  );
}

export function DeleteItemButton({ type, id }: { type: string; id: string }) {
  const [state, action, pending] = useActionState<RecordFormState, FormData>(deleteItemAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("この行を削除しますか?")) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="text-brand04 hover:text-brand03 text-xs font-bold transition-colors">
        {pending ? "削除中…" : "削除"}
      </button>
      {state?.error ? <span className="text-brand03 ml-2 text-xs">{state.error}</span> : null}
    </form>
  );
}
