"use client";

import { useActionState, useState } from "react";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD_CLASS,
  Field,
  FormNotice,
  StatusTag,
} from "../../shared/ui/form";
import { updateMasterAction, type MasterFormState } from "../actions";
import type { MasterKey, MasterRow } from "../config";

export function MasterRowItem({ masterKey, row }: { masterKey: MasterKey; row: MasterRow }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<MasterFormState, FormData>(
    async (prev, formData) => {
      const result = await updateMasterAction(prev, formData);
      if (result?.success) setEditing(false);
      return result;
    },
    undefined,
  );

  return (
    <li className="border-brand04/40 border-b first:border-t">
      {editing ? (
        <form action={action} className="bg-bg01/50 flex flex-col gap-4 p-4">
          <input type="hidden" name="key" value={masterKey} />
          <input type="hidden" name="id" value={row.id} />
          {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
          <p className="text-brand04 text-xs">
            コード: <span className="font-heading text-brand01 font-bold">{row.code}</span>
            (変更できません)
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="名称" htmlFor={`name-${row.id}`} required>
              <input
                id={`name-${row.id}`}
                name="name"
                required
                maxLength={50}
                defaultValue={row.name}
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="並び順" htmlFor={`sort-${row.id}`}>
              <input
                id={`sort-${row.id}`}
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={row.sortOrder}
                className={FIELD_CLASS}
              />
            </Field>
            {masterKey === "positions" ? (
              <Field label="序列" htmlFor={`rank-${row.id}`}>
                <input
                  id={`rank-${row.id}`}
                  name="rank"
                  type="number"
                  min={0}
                  defaultValue={row.rank ?? 0}
                  className={FIELD_CLASS}
                />
              </Field>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {masterKey === "positions" ? (
              <label className="text-brand01 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isManagement"
                  defaultChecked={row.isManagement}
                  className="size-4"
                />
                管理職として扱う
              </label>
            ) : null}
            <label className="text-brand01 flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={row.isActive} className="size-4" />
              有効(外すと新規の選択肢に出なくなります。既存の履歴は残ります)
            </label>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
              {pending ? "保存中…" : "保存"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className={BUTTON_SECONDARY}>
              キャンセル
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 py-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className={`font-bold ${row.isActive ? "text-brand01" : "text-brand04"}`}>
                {row.name}
              </span>
              {!row.isActive ? <StatusTag tone="muted">無効</StatusTag> : null}
              {row.isManagement ? <StatusTag tone="info">管理職</StatusTag> : null}
            </p>
            <p className="text-brand04 text-xs">
              コード <span className="font-heading">{row.code}</span> ・ 並び順 {row.sortOrder}
              {row.rank !== undefined ? ` ・ 序列 ${row.rank}` : ""}
            </p>
          </div>
          {state?.success ? <span className="text-link text-xs font-bold">{state.success}</span> : null}
          <button type="button" onClick={() => setEditing(true)} className={BUTTON_SECONDARY}>
            編集
          </button>
        </div>
      )}
    </li>
  );
}
