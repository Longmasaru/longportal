"use client";

import { useActionState, useRef } from "react";
import { BUTTON_PRIMARY, FIELD_CLASS, Field, FormNotice } from "../../shared/ui/form";
import { createMasterAction, type MasterFormState } from "../actions";
import { MASTER_LABEL, type MasterKey } from "../config";

export function MasterCreateForm({ masterKey }: { masterKey: MasterKey }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<MasterFormState, FormData>(
    async (prev, formData) => {
      const result = await createMasterAction(prev, formData);
      if (result?.success) formRef.current?.reset();
      return result;
    },
    undefined,
  );
  const label = MASTER_LABEL[masterKey];

  return (
    <form
      ref={formRef}
      action={action}
      className="border-brand01/20 flex flex-col gap-4 border bg-white p-5"
    >
      <h2 className="text-brand01 font-bold">{label}を追加</h2>
      <input type="hidden" name="key" value={masterKey} />
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="名称" htmlFor="create-name" required>
          <input id="create-name" name="name" required maxLength={50} className={FIELD_CLASS} />
        </Field>
        <Field
          label="コード"
          htmlFor="create-code"
          required
          hint="半角小文字・数字・_。作成後は変更できません。"
        >
          <input
            id="create-code"
            name="code"
            required
            maxLength={50}
            pattern="[a-z0-9_]+"
            autoCapitalize="none"
            spellCheck={false}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="並び順" htmlFor="create-sort">
          <input
            id="create-sort"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={0}
            className={FIELD_CLASS}
          />
        </Field>
        {masterKey === "positions" ? (
          <Field label="序列" htmlFor="create-rank" hint="大きいほど上位(運用で決めます)。">
            <input
              id="create-rank"
              name="rank"
              type="number"
              min={0}
              defaultValue={0}
              className={FIELD_CLASS}
            />
          </Field>
        ) : null}
      </div>
      {masterKey === "positions" ? (
        <label className="text-brand01 flex items-center gap-2 text-sm">
          <input type="checkbox" name="isManagement" className="size-4" />
          管理職として扱う(Audience の「管理職」条件に使われます)
        </label>
      ) : null}
      <div>
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "追加中…" : "追加"}
        </button>
      </div>
    </form>
  );
}
