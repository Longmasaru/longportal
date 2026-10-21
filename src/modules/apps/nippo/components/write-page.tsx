import Link from "next/link";
import { requireAppAccess } from "@/modules/core/apps";
import { isIsoDate } from "@/modules/core/shared/date";
import { TEXT_FIELDS } from "../labels";
import { emptyFields, type ReportFields } from "../logic";
import { manifest } from "../manifest";
import { getOwnReportByDate } from "../queries";
import { dateWithWeekday } from "./parts";
import { ReportForm } from "./report-form";

/** /apps/nippo/write?date=YYYY-MM-DD。自分の日報を書く(その日の日報があれば、続きから)。既定は今日(JST)。 */
export async function NippoWritePage({ date }: { date?: string }) {
  const actor = await requireAppAccess(manifest.appKey);
  if (!actor.employee) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-10">
        <p className="bg-bg01 text-brand01 p-4 text-sm">このアカウントには社員の情報が紐づいていないため、日報を書けません。</p>
      </div>
    );
  }
  const reportDate = date && isIsoDate(date) && date <= actor.today ? date : actor.today;
  const current = await getOwnReportByDate(actor.employee.id, reportDate);
  const initial: ReportFields = current
    ? {
        ...(Object.fromEntries(TEXT_FIELDS.map((f) => [f, current[f]])) as Record<(typeof TEXT_FIELDS)[number], string>),
        score: current.score,
        scoreNote: current.scoreNote,
      }
    : emptyFields();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <div>
        <Link href={`${manifest.route}?tab=mine`} className="text-brand04 hover:text-brand03 text-sm font-bold transition-colors">
          ‹ 自分の日報
        </Link>
        <h1 className="text-brand01 mt-2 text-2xl font-bold">
          {dateWithWeekday(reportDate)} の日報
          {current?.status === "submitted" ? <span className="text-brand04 ml-3 text-sm font-normal">提出済み(直すと、そのまま更新されます)</span> : null}
        </h1>
        <p className="text-brand01 mt-1 text-sm">{actor.employee.name}</p>
      </div>
      <ReportForm
        key={reportDate}
        reportDate={reportDate}
        today={actor.today}
        initial={initial}
        status={current?.status ?? null}
        reportId={current?.id ?? null}
      />
    </div>
  );
}
