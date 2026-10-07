"use client";

import { useActionState, useState } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, Field, FormNotice } from "../../shared/ui/form";
import { endAssignmentAction, transferAction, type EmployeeFormState } from "../actions";
import type { FormOptions } from "../queries";

/** 主所属の設定・異動フォーム(MVP は主所属のみ)。 */
export function TransferForm({
  employeeId,
  options,
  today,
  hasCurrent,
}: {
  employeeId: string;
  options: FormOptions;
  today: string;
  hasCurrent: boolean;
}) {
  const [state, action, pending] = useActionState<EmployeeFormState, FormData>(transferAction, undefined);

  return (
    <form action={action} className="border-brand01/20 flex flex-col gap-4 border bg-white p-5">
      <h3 className="text-brand01 font-bold">{hasCurrent ? "異動(主所属の変更)" : "主所属の設定"}</h3>
      <input type="hidden" name="employeeId" value={employeeId} />
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="部署" htmlFor="tf-department" required>
          <select id="tf-department" name="departmentId" required defaultValue="" className={FIELD_CLASS}>
            <option value="" disabled>
              選択してください
            </option>
            {options.departments.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="拠点" htmlFor="tf-location" required>
          <select id="tf-location" name="locationId" required defaultValue="" className={FIELD_CLASS}>
            <option value="" disabled>
              選択してください
            </option>
            {options.locations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="異動日(新しい所属の開始日)"
          htmlFor="tf-date"
          required
          hint={hasCurrent ? "現在の主所属は、この日の前日で終了します。" : undefined}
        >
          <input id="tf-date" name="effectiveDate" type="date" required defaultValue={today} className={FIELD_CLASS} />
        </Field>
      </div>
      <div>
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "処理中…" : hasCurrent ? "異動を登録" : "所属を設定"}
        </button>
      </div>
    </form>
  );
}

/** 所属の終了(終了日の設定)。 */
export function EndAssignmentForm({
  assignmentId,
  startDate,
  today,
}: {
  assignmentId: string;
  startDate: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<EmployeeFormState, FormData>(
    async (prev, formData) => {
      const result = await endAssignmentAction(prev, formData);
      if (result?.success) setOpen(false);
      return result;
    },
    undefined,
  );

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={BUTTON_SECONDARY}>
        終了
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <div>
        <label htmlFor={`end-${assignmentId}`} className="text-brand01 mb-1 block text-xs font-bold">
          終了日(最終日)
        </label>
        <input
          id={`end-${assignmentId}`}
          name="endDate"
          type="date"
          required
          min={startDate}
          defaultValue={today >= startDate ? today : startDate}
          className={`${FIELD_CLASS} !w-auto`}
        />
      </div>
      <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
        {pending ? "…" : "終了する"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={BUTTON_SECONDARY}>
        取消
      </button>
      {state?.error ? <span className="text-brand01 w-full text-xs font-bold">{state.error}</span> : null}
    </form>
  );
}
