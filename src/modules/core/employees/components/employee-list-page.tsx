import Link from "next/link";
import { requireAdmin } from "../../access";
import { formatDateDot } from "../../shared/format";
import { todayJst } from "../../shared/jst";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD_CLASS,
  PageHeading,
  StatusTag,
} from "../../shared/ui/form";
import { EMPLOYEE_STATUS_LABEL, EMPLOYEE_STATUS_OPTIONS } from "../labels";
import { listEmployees, type EmployeeListItem } from "../queries";

function AssignmentCell({ item }: { item: EmployeeListItem }) {
  if (item.current) {
    return (
      <span className="text-brand01">
        {item.current.locationName} / {item.current.departmentName}
      </span>
    );
  }
  if (item.upcoming) {
    return (
      <span className="text-brand04">
        <StatusTag tone="info">予定</StatusTag> {item.upcoming.locationName} / {item.upcoming.departmentName}
        <span className="block text-xs">{formatDateDot(item.upcoming.startDate)} から</span>
      </span>
    );
  }
  return <StatusTag tone="attention">未配属</StatusTag>;
}

function StatusCell({ item }: { item: EmployeeListItem }) {
  const label = EMPLOYEE_STATUS_LABEL[item.status as keyof typeof EMPLOYEE_STATUS_LABEL] ?? item.status;
  return (
    <span>
      <StatusTag tone={item.status === "retired" ? "muted" : item.status === "planned" ? "info" : "neutral"}>
        {label}
      </StatusTag>
      <span className="text-brand04 mt-1 block text-xs">
        入社 {formatDateDot(item.hiredOn)}
        {item.leftOn ? ` ・ 退職 ${formatDateDot(item.leftOn)}` : ""}
      </span>
    </span>
  );
}

export async function EmployeeListPage({
  q,
  status,
  warningOnly,
}: {
  q?: string;
  status?: string;
  warningOnly?: boolean;
}) {
  await requireAdmin();
  const today = todayJst();
  const items = await listEmployees(today, {
    q: q?.trim() || undefined,
    status: status && EMPLOYEE_STATUS_OPTIONS.includes(status as "active") ? status : undefined,
    warningOnly,
  });
  const warningCount = items.filter((i) => i.warnings.length > 0).length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="社員管理"
        description="社員の登録・所属(異動履歴)・ログインアカウントを管理します。"
        aside={
          <Link href="/admin/employees/new" className={`${BUTTON_PRIMARY} inline-block`}>
            社員を登録
          </Link>
        }
      />

      <form method="get" className="border-brand01/20 flex flex-wrap items-end gap-4 border bg-white p-4">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="text-brand01 mb-1.5 block text-sm font-bold">
            氏名・社員番号
          </label>
          <input id="q" name="q" defaultValue={q} className={FIELD_CLASS} />
        </div>
        <div>
          <label htmlFor="status" className="text-brand01 mb-1.5 block text-sm font-bold">
            状態
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className={FIELD_CLASS}>
            <option value="">すべて</option>
            {EMPLOYEE_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {EMPLOYEE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <label className="text-brand01 flex items-center gap-2 pb-2.5 text-sm">
          <input type="checkbox" name="warning" value="1" defaultChecked={warningOnly} className="size-4" />
          警告のある社員だけ
        </label>
        <button type="submit" className={BUTTON_PRIMARY}>
          検索
        </button>
        <Link href="/admin/employees" className={BUTTON_SECONDARY}>
          クリア
        </Link>
      </form>

      <section aria-label="社員の一覧">
        <p className="text-brand04 mb-2 text-sm">
          {items.length}名
          {warningCount > 0 ? (
            <>
              {" ・ "}
              <span className="text-brand01 font-bold">警告 {warningCount}名</span>
            </>
          ) : null}
        </p>
        {items.length === 0 ? (
          <p className="border-brand01/15 text-brand04 border-y py-10 text-center text-sm">
            該当する社員がいません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead>
                <tr className="border-brand01 text-brand01 border-b-2 text-xs">
                  <th className="px-2 py-2 font-bold">社員</th>
                  <th className="px-2 py-2 font-bold">主所属(今日時点)</th>
                  <th className="px-2 py-2 font-bold">役職 / 雇用区分</th>
                  <th className="px-2 py-2 font-bold">状態</th>
                  <th className="px-2 py-2 font-bold">アカウント</th>
                  <th className="px-2 py-2 font-bold">警告</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-brand04/40 border-b align-top">
                    <td className="px-2 py-3">
                      <Link
                        href={`/admin/employees/${item.id}`}
                        className="text-brand01 hover:text-brand03 font-bold transition-colors"
                      >
                        {item.name}
                      </Link>
                      <span className="text-brand04 block text-xs">
                        <span className="font-heading">{item.employeeNumber}</span>
                        {item.nameKana ? ` ・ ${item.nameKana}` : ""}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <AssignmentCell item={item} />
                    </td>
                    <td className="px-2 py-3">
                      <span className="text-brand01">{item.positionName ?? "役職なし"}</span>
                      <span className="text-brand04 block text-xs">{item.employmentTypeName}</span>
                    </td>
                    <td className="px-2 py-3">
                      <StatusCell item={item} />
                    </td>
                    <td className="px-2 py-3">
                      {item.user ? (
                        <span>
                          <StatusTag tone={item.user.status === "active" ? "info" : "muted"}>
                            {item.user.status === "active" ? "有効" : "無効"}
                          </StatusTag>
                          <span className="text-brand04 mt-1 block text-xs">{item.user.loginId}</span>
                        </span>
                      ) : (
                        <span className="text-brand04 text-xs">なし</span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      {item.warnings.length > 0 ? (
                        <ul className="flex flex-col gap-1">
                          {item.warnings.map((w) => (
                            <li key={w.code}>
                              <StatusTag tone="attention">
                                {w.code === "unassigned" || w.code === "unassigned_soon"
                                  ? "所属未設定"
                                  : w.code === "planned_overdue"
                                    ? "入社予定のまま"
                                    : w.code === "no_current_assignment"
                                      ? "所属が開始前"
                                    : "アカウント要無効化"}
                              </StatusTag>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-brand04 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
