"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { BUTTON_PRIMARY, FIELD_CLASS, Field, FormNotice, LINK_CLASS, StatusTag } from "../../shared/ui/form";
import { changeAssignmentsAction, type AssignmentsFormState } from "../actions";

export type AssignmentBoardRow = {
  id: string;
  employeeNumber: string;
  name: string;
  /** 今日時点の主所属(所属がなければ null) */
  departmentId: string | null;
  departmentName: string | null;
  locationId: string | null;
  /** 有効な部署・拠点の主所属があり、この画面で変えられるか */
  editable: boolean;
};

type Choice = { departmentId: string; locationId: string };

/** 所属の割り当ての表。各行の選択欄で部署を、丸(ラジオボタン)で拠点を選び、まとめて保存する。 */
export function AssignmentBoardForm({
  rows,
  departments,
  locations,
  today,
}: {
  rows: AssignmentBoardRow[];
  departments: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  today: string;
}) {
  const [state, action, pending] = useActionState<AssignmentsFormState, FormData>(
    changeAssignmentsAction,
    undefined,
  );
  // 画面上の選択(選択欄・丸はこの値で表示する)。保存に成功すると rows(今の所属)が新しくなり、
  // 選択と一致するので「変更あり」は 0 に戻る。失敗したときは、選択をそのまま残す。
  const [selected, setSelected] = useState<Record<string, Partial<Choice>>>({});
  const choiceOf = (r: AssignmentBoardRow): Choice | null =>
    r.editable && r.departmentId && r.locationId
      ? {
          departmentId: selected[r.id]?.departmentId ?? r.departmentId,
          locationId: selected[r.id]?.locationId ?? r.locationId,
        }
      : null;
  const isChanged = (r: AssignmentBoardRow) => {
    const c = choiceOf(r);
    return c !== null && (c.departmentId !== r.departmentId || c.locationId !== r.locationId);
  };
  const choose = (id: string, patch: Partial<Choice>) =>
    setSelected((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const changedRows = rows.filter(isChanged);
  const changedCount = changedRows.length;
  const failureFor = new Map((state?.failures ?? []).map((f) => [f.employeeId, f.message]));
  const countByLocation = (id: string) => rows.filter((r) => choiceOf(r)?.locationId === id).length;

  // 送信内容は、画面の入力欄ではなく、覚えている選択(state)から「変えた行だけ」を組み立てる。
  // form の action に渡すと、送信後にブラウザがフォームを初期状態に戻し、選択欄の見た目が
  // 先頭の部署に戻ってしまう(値はそのまま)ため、onSubmit で送り、フォームのリセットを起こさない。
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData();
    formData.set("effectiveDate", String(new FormData(event.currentTarget).get("effectiveDate") ?? ""));
    for (const row of changedRows) {
      const choice = choiceOf(row)!;
      formData.set(`dept_${row.id}`, choice.departmentId);
      formData.set(`loc_${row.id}`, choice.locationId);
    }
    startTransition(() => action(formData));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}

      <div className="border-brand01/20 flex flex-wrap items-end gap-4 border bg-white p-4">
        <Field
          label="変更日"
          htmlFor="ab-date"
          required
          hint="この日から新しい所属になります(前の所属は前日まで)。"
        >
          <input
            id="ab-date"
            name="effectiveDate"
            type="date"
            required
            defaultValue={today}
            className={FIELD_CLASS}
          />
        </Field>
        <button type="submit" disabled={pending || changedCount === 0} className={BUTTON_PRIMARY}>
          {pending ? "保存中…" : changedCount > 0 ? `${changedCount}名の変更を保存` : "変更なし"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead>
            <tr className="border-brand01 text-brand01 border-b-2 text-xs">
              <th className="px-2 py-2 font-bold">社員</th>
              <th className="px-2 py-2 font-bold">部署</th>
              {locations.map((l) => (
                <th key={l.id} className="px-2 py-2 text-center font-bold">
                  {l.name}
                  <span className="text-brand04 block font-normal">{countByLocation(l.id)}名</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const choice = choiceOf(row);
              const failure = failureFor.get(row.id);
              return (
                <tr
                  key={row.id}
                  className={`border-brand04/40 border-b ${isChanged(row) ? "bg-bg01" : ""}`}
                >
                  <td className="px-2 py-2.5">
                    <Link href={`/admin/employees/${row.id}`} className={LINK_CLASS}>
                      {row.name}
                    </Link>
                    <span className="font-heading text-brand04 block text-xs">{row.employeeNumber}</span>
                    {failure ? <span className="text-brand03 block text-xs">{failure}</span> : null}
                  </td>
                  <td className="px-2 py-2.5">
                    {choice ? (
                      <select
                        name={`dept_${row.id}`}
                        value={choice.departmentId}
                        onChange={(e) => choose(row.id, { departmentId: e.target.value })}
                        aria-label={`${row.name}の部署`}
                        className={`${FIELD_CLASS} py-1.5`}
                      >
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    ) : row.departmentName ? (
                      <span className="text-brand01">
                        {row.departmentName}
                        <span className="text-brand04 block text-xs">無効な部署・拠点(詳細画面で変更)</span>
                      </span>
                    ) : (
                      <StatusTag tone="attention">所属未設定</StatusTag>
                    )}
                  </td>
                  {locations.map((l) => (
                    <td key={l.id} className="px-2 py-2.5 text-center">
                      {choice ? (
                        <input
                          type="radio"
                          name={`loc_${row.id}`}
                          value={l.id}
                          checked={choice.locationId === l.id}
                          onChange={() => choose(row.id, { locationId: l.id })}
                          aria-label={`${row.name}の拠点: ${l.name}`}
                          className="accent-brand01 size-4 cursor-pointer"
                        />
                      ) : (
                        <span className="text-brand04 text-xs">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-brand04 text-xs">
        所属未設定の社員は、社員の詳細画面で部署と拠点を設定してください。無効にした部署・拠点に所属している社員は、詳細画面で変更してください。
      </p>
    </form>
  );
}
