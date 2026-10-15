"use client";

import { useActionState } from "react";
import {
  BUTTON_PRIMARY,
  FIELD_CLASS,
  Field,
  FormNotice,
} from "../../shared/ui/form";
import { createEmployeeAction, updateEmployeeAction, type EmployeeFormState } from "../actions";
import { EMPLOYEE_STATUS_LABEL, EMPLOYEE_STATUS_OPTIONS } from "../labels";
import type { FormOptions } from "../queries";

export type EmployeeFormValues = {
  id: string;
  employeeNumber: string;
  familyName: string;
  givenName: string | null;
  familyNameKana: string | null;
  givenNameKana: string | null;
  employmentTypeId: string;
  positionId: string | null;
  hiredOn: string;
  leftOn: string | null;
  status: string;
};

export function EmployeeForm({
  options,
  employee,
}: {
  options: FormOptions;
  /** 指定すると編集、なければ新規登録。 */
  employee?: EmployeeFormValues;
}) {
  const editing = employee !== undefined;
  const [state, action, pending] = useActionState<EmployeeFormState, FormData>(
    editing ? updateEmployeeAction : createEmployeeAction,
    undefined,
  );

  return (
    <form action={action} className="border-brand01/20 flex flex-col gap-5 border bg-white p-5">
      {editing ? <input type="hidden" name="id" value={employee.id} /> : null}
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="社員番号" htmlFor="employeeNumber" required>
          <input
            id="employeeNumber"
            name="employeeNumber"
            required
            maxLength={30}
            defaultValue={employee?.employeeNumber}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="姓" htmlFor="familyName" required hint="外国籍の方は、ミドルネームまでを姓に入れます。">
          <input
            id="familyName"
            name="familyName"
            required
            maxLength={40}
            defaultValue={employee?.familyName}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="名" htmlFor="givenName">
          <input
            id="givenName"
            name="givenName"
            maxLength={40}
            defaultValue={employee?.givenName ?? ""}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="姓(かな)" htmlFor="familyNameKana">
          <input
            id="familyNameKana"
            name="familyNameKana"
            maxLength={40}
            defaultValue={employee?.familyNameKana ?? ""}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="名(かな)" htmlFor="givenNameKana">
          <input
            id="givenNameKana"
            name="givenNameKana"
            maxLength={40}
            defaultValue={employee?.givenNameKana ?? ""}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="雇用区分" htmlFor="employmentTypeId" required>
          <select
            id="employmentTypeId"
            name="employmentTypeId"
            required
            defaultValue={employee?.employmentTypeId ?? ""}
            className={FIELD_CLASS}
          >
            <option value="" disabled>
              選択してください
            </option>
            {options.employmentTypes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="役職" htmlFor="positionId">
          <select
            id="positionId"
            name="positionId"
            defaultValue={employee?.positionId ?? ""}
            className={FIELD_CLASS}
          >
            <option value="">役職なし</option>
            {options.positions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="状態" htmlFor="status" required hint="利用の可否は、状態・入社日・退職日から毎回判定されます。">
          <select id="status" name="status" required defaultValue={employee?.status ?? "planned"} className={FIELD_CLASS}>
            {EMPLOYEE_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {EMPLOYEE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="入社日" htmlFor="hiredOn" required>
          <input id="hiredOn" name="hiredOn" type="date" required defaultValue={employee?.hiredOn} className={FIELD_CLASS} />
        </Field>
        <Field
          label="退職日(最終在籍日)"
          htmlFor="leftOn"
          hint="この日までは利用でき、翌日から利用できなくなります。退職予定日を先に入れても構いません。"
        >
          <input id="leftOn" name="leftOn" type="date" defaultValue={employee?.leftOn ?? ""} className={FIELD_CLASS} />
        </Field>
      </div>

      {!editing ? (
        <fieldset className="border-brand01/15 flex flex-col gap-4 border-t pt-5">
          <legend className="text-brand01 pr-3 font-bold">初期の所属(任意)</legend>
          <p className="text-brand04 text-sm">
            配属が未確定なら空のままで構いません(登録後に設定できます。アカウントの発行には主所属が必要です)。
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="部署" htmlFor="departmentId">
              <select id="departmentId" name="departmentId" defaultValue="" className={FIELD_CLASS}>
                <option value="">未設定</option>
                {options.departments.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="拠点" htmlFor="locationId">
              <select id="locationId" name="locationId" defaultValue="" className={FIELD_CLASS}>
                <option value="">未設定</option>
                {options.locations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="開始日" htmlFor="startDate" hint="空なら入社日になります。">
              <input id="startDate" name="startDate" type="date" className={FIELD_CLASS} />
            </Field>
          </div>
        </fieldset>
      ) : null}

      <div>
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "保存中…" : editing ? "保存" : "登録"}
        </button>
      </div>
    </form>
  );
}
