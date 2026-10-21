import Link from "next/link";
import { canInAnyScope } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS } from "@/modules/core/shared/ui/form";
import type { ReviewView } from "../labels";
import { manifest, NIPPO_REPORTS_REVIEW } from "../manifest";
import { listOwnReports, listReviewReports, listWriters } from "../queries";
import type { ReportSummary } from "../types";
import { CommentState, dateWithWeekday, firstLine, Score } from "./parts";

const TAB = "border-brand01/20 text-brand01 hover:border-brand03 hover:text-brand03 border bg-white px-3 py-1 text-sm font-bold transition-colors";
const TAB_ACTIVE = "border-brand01 bg-brand01 border px-3 py-1 text-sm font-bold text-white";

function Header({ description, aside }: { description: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
          DAILY REPORT<span className="text-brand04 ml-3 font-medium tracking-[0.1em]">日報</span>
        </p>
        <h1 className="text-brand01 mt-2 text-2xl font-bold">日報</h1>
        <p className="text-brand04 mt-1 text-sm">{description}</p>
      </div>
      {aside}
    </div>
  );
}

function ReportTable({ rows, showName }: { rows: ReportSummary[]; showName: boolean }) {
  if (rows.length === 0) {
    return <p className="border-brand01/15 text-brand04 border-y py-10 text-center text-sm">該当する日報がありません。</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-brand01 text-brand01 border-b-2 text-xs">
            <th className="px-2 py-2 font-bold">日付</th>
            {showName ? <th className="px-2 py-2 font-bold">氏名</th> : null}
            <th className="px-2 py-2 font-bold">今日の研修内容</th>
            <th className="px-2 py-2 font-bold">点数</th>
            <th className="px-2 py-2 font-bold">指導者のコメント</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const href = r.status === "draft" ? `${manifest.route}/write?date=${r.reportDate}` : `${manifest.route}/${r.id}`;
            return (
              <tr key={r.id} className="border-brand04/40 border-b align-top">
                <td className="px-2 py-3 whitespace-nowrap">
                  <Link href={href} className="text-brand01 hover:text-brand03 font-heading font-bold tabular-nums transition-colors">
                    {dateWithWeekday(r.reportDate)}
                  </Link>
                </td>
                {showName ? <td className="text-brand01 px-2 py-3 font-bold whitespace-nowrap">{r.employeeName}</td> : null}
                <td className="text-brand01 px-2 py-3">
                  <Link href={href} className="hover:text-brand03 line-clamp-2 transition-colors">
                    {firstLine(r.training) || <span className="text-brand04">(未記入)</span>}
                  </Link>
                </td>
                <td className="px-2 py-3">
                  <Score score={r.score} />
                </td>
                <td className="px-2 py-3 whitespace-nowrap">
                  <CommentState status={r.status} reviewerComments={r.reviewerComments} />
                  {r.ownerComments > 0 ? <span className="text-brand04 ml-2 text-xs">返信 {r.ownerComments}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * /apps/nippo。指導者(nippo.reports.review)には、スコープ内の社員の提出済みの日報を出す(既定はコメント待ち)。
 * それ以外の人と「自分の日報」タブでは、自分の日報の一覧を出す。docs/DESIGN.md 38 章。
 */
export async function NippoPage({ tab, view, employeeId }: { tab?: string; view: ReviewView; employeeId?: string }) {
  const actor = await requireAppAccess(manifest.appKey);
  const isReviewer = canInAnyScope(actor, NIPPO_REPORTS_REVIEW);
  const showMine = !isReviewer || tab === "mine";

  const writeButton = actor.employee ? (
    <Link href={`${manifest.route}/write`} className={`${BUTTON_PRIMARY} inline-block`}>
      今日の日報を書く
    </Link>
  ) : null;

  const tabs = isReviewer ? (
    <nav aria-label="表示の切り替え" className="flex flex-wrap gap-2">
      <Link href={manifest.route} className={showMine ? TAB : TAB_ACTIVE}>
        みんなの日報
      </Link>
      {actor.employee ? (
        <Link href={`${manifest.route}?tab=mine`} className={showMine ? TAB_ACTIVE : TAB}>
          自分の日報
        </Link>
      ) : null}
    </nav>
  ) : null;

  if (showMine) {
    if (!actor.employee) {
      return (
        <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-10">
          <p className="bg-bg01 text-brand01 p-4 text-sm">このアカウントには社員の情報が紐づいていないため、日報を書けません。</p>
        </div>
      );
    }
    const rows = await listOwnReports(actor.employee.id);
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
        <Header description="毎日の研修の内容と学びを書いて、提出します。指導者からのコメントが届きます。" aside={writeButton} />
        {tabs}
        <section aria-label="自分の日報">
          <p className="text-brand04 mb-2 text-sm">{rows.length}件</p>
          <ReportTable rows={rows} showName={false} />
        </section>
      </div>
    );
  }

  const [rows, writers] = await Promise.all([
    listReviewReports(actor, { pendingOnly: view === "pending", employeeId }),
    listWriters(actor),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <Header description="提出された日報を読んで、コメントを返します。" aside={writeButton} />
      {tabs}
      <form method="get" className="border-brand01/20 flex flex-wrap items-end gap-4 border bg-white p-4">
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <legend className="text-brand01 mb-1.5 block text-sm font-bold">表示</legend>
          <label className="text-brand01 flex items-center gap-1.5 text-sm">
            <input type="radio" name="view" value="pending" defaultChecked={view === "pending"} className="size-4" />
            コメント待ちだけ
          </label>
          <label className="text-brand01 flex items-center gap-1.5 text-sm">
            <input type="radio" name="view" value="all" defaultChecked={view === "all"} className="size-4" />
            すべて
          </label>
        </fieldset>
        <div className="min-w-48">
          <label htmlFor="employee" className="text-brand01 mb-1.5 block text-sm font-bold">
            書いた人
          </label>
          <select id="employee" name="employee" defaultValue={employeeId ?? ""} className={FIELD_CLASS}>
            <option value="">全員</option>
            {writers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={BUTTON_PRIMARY}>
          表示
        </button>
        <Link href={`${manifest.route}?view=all`} className={BUTTON_SECONDARY}>
          クリア
        </Link>
      </form>
      <section aria-label="提出された日報">
        <p className="text-brand04 mb-2 text-sm">{rows.length}件</p>
        <ReportTable rows={rows} showName />
      </section>
    </div>
  );
}
