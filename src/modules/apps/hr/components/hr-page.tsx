import Link from "next/link";
import { canInAnyScope } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { formatDateDot } from "@/modules/core/shared/format";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, StatusTag } from "@/modules/core/shared/ui/form";
import type { RecordKind, Tab } from "../labels";
import { HR_RECORDS_MANAGE, manifest } from "../manifest";
import { listManagedEmployees, reportsOfActor } from "../queries";
import { EmployeeRecordsView } from "./employee-page";

/**
 * /apps/hr。権限(hr.records.manage)を持つ人と、部下がいる人(31.4)には、見られる社員の一覧を出す。
 * どちらでもない人には、自分のページ(本人に公開の記録だけ)を出す。docs/DESIGN.md 31 章。
 */
export async function HrPage({ q, all, kind, tab }: { q?: string; all?: boolean; kind: RecordKind | null; tab: Tab }) {
  const actor = await requireAppAccess(manifest.appKey);

  const canManage = canInAnyScope(actor, HR_RECORDS_MANAGE);
  const reports = await reportsOfActor(actor);

  if (!canManage && reports.size === 0) {
    if (actor.employee) return <EmployeeRecordsView actor={actor} employeeId={actor.employee.id} kind={kind} tab={tab} />;
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-10">
        <p className="bg-bg01 text-brand01 p-4 text-sm">このアカウントには社員の情報が紐づいていないため、表示できる記録がありません。</p>
      </div>
    );
  }

  const rows = await listManagedEmployees(actor, { q, includeRetired: all, reports });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
            HR<span className="text-brand04 ml-3 font-medium tracking-[0.1em]">人事管理</span>
          </p>
          <h1 className="text-brand01 mt-2 text-2xl font-bold">人事管理</h1>
          <p className="text-brand04 mt-1 text-sm">
            {canManage
              ? "社員を選ぶと、面談で話したこと・注意・ほめの記録を見たり、書いたりできます。"
              : "部下を選ぶと、1on1 などの記録を見たり書いたりできます(基本情報・目標と評価・スキルと資格は読むだけ)。"}
          </p>
        </div>
        {actor.employee ? (
          <Link href={`${manifest.route}/${actor.employee.id}`} className={`${BUTTON_SECONDARY} inline-block`}>
            自分の記録
          </Link>
        ) : null}
      </div>

      <form method="get" className="border-brand01/20 flex flex-wrap items-end gap-4 border bg-white p-4">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="text-brand01 mb-1.5 block text-sm font-bold">
            氏名・フリガナ・社員番号
          </label>
          <input id="q" name="q" defaultValue={q} className={FIELD_CLASS} />
        </div>
        <label className="text-brand01 flex items-center gap-2 pb-2.5 text-sm">
          <input type="checkbox" name="all" value="1" defaultChecked={all} className="size-4" />
          退職した社員も出す
        </label>
        <button type="submit" className={BUTTON_PRIMARY}>
          検索
        </button>
        <Link href={manifest.route} className={BUTTON_SECONDARY}>
          クリア
        </Link>
      </form>

      <section aria-label="社員の一覧">
        <p className="text-brand04 mb-2 text-sm">{rows.length}名</p>
        {rows.length === 0 ? (
          <p className="border-brand01/15 text-brand04 border-y py-10 text-center text-sm">該当する社員がいません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-brand01 text-brand01 border-b-2 text-xs">
                  <th className="px-2 py-2 font-bold">社員</th>
                  <th className="px-2 py-2 font-bold">所属 / 役職</th>
                  <th className="px-2 py-2 font-bold">記録</th>
                  <th className="px-2 py-2 font-bold">最新の記録</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const primary = r.assignments[0];
                  return (
                    <tr key={r.id} className="border-brand04/40 border-b align-top">
                      <td className="px-2 py-3">
                        <Link
                          href={`${manifest.route}/${r.id}`}
                          className="text-brand01 hover:text-brand03 font-bold transition-colors"
                        >
                          {r.name}
                        </Link>
                        {r.id === actor.employee?.id ? <span className="text-brand04 ml-2 text-xs">(自分)</span> : null}
                        {r.status === "retired" ? (
                          <span className="ml-2">
                            <StatusTag tone="muted">退職</StatusTag>
                          </span>
                        ) : null}
                        <span className="text-brand04 block text-xs">
                          <span className="font-heading">{r.employeeNumber}</span>
                          {r.nameKana ? ` ・ ${r.nameKana}` : ""}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <span className="text-brand01">
                          {primary ? `${primary.locationName} / ${primary.departmentName}` : "所属なし"}
                        </span>
                        <span className="text-brand04 block text-xs">{r.positionName ?? "役職なし"}</span>
                      </td>
                      <td className="text-brand01 px-2 py-3 tabular-nums">{r.recordCount}件</td>
                      <td className="text-brand04 px-2 py-3 tabular-nums">
                        {r.lastRecordOn ? formatDateDot(r.lastRecordOn) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
