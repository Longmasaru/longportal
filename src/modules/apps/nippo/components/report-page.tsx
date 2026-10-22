import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAppAccess } from "@/modules/core/apps";
import { reportToDocText } from "../doc-text";
import { FIELD_DEF, TEXT_FIELDS, type TextField } from "../labels";
import { manifest } from "../manifest";
import { getNeighbors, getReportDetail, modeForReport } from "../queries";
import { CommentForm, DeleteCommentButton } from "./comment-form";
import { CopyDocButton } from "./copy-doc-button";
import { DATE_TIME, dateWithWeekday, Score } from "./parts";

const idSchema = z.uuid();

/** 章ごとに、書かれている項目だけを並べる。 */
function Sections({ report }: { report: Record<TextField, string> }) {
  const sections = new Map<string, TextField[]>();
  for (const f of TEXT_FIELDS) {
    if (!report[f].trim()) continue;
    const s = FIELD_DEF[f].section;
    sections.set(s, [...(sections.get(s) ?? []), f]);
  }
  return (
    <>
      {[...sections].map(([section, fields]) => (
        <section key={section} className="border-brand01/15 flex flex-col gap-3 border-t pt-4">
          <h2 className="text-brand01 text-base font-bold">{section}</h2>
          {fields.map((f) => (
            <div key={f}>
              {fields.length > 1 ? <h3 className="text-brand04 mb-1 text-xs font-bold tracking-widest">{FIELD_DEF[f].label}</h3> : null}
              <p className="text-brand01 text-sm leading-relaxed whitespace-pre-wrap">{report[f]}</p>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

/** /apps/nippo/<id>。日報 1 件と、指導者とのコメントのやり取り。本人と、スコープ内の指導者(提出済みだけ)が見られる。 */
export async function NippoReportPage({ id }: { id: string }) {
  const actor = await requireAppAccess(manifest.appKey);
  if (!idSchema.safeParse(id).success) notFound();
  const report = await getReportDetail(id);
  if (!report) notFound();
  const mode = await modeForReport(actor, report);
  if (mode === "none") notFound();
  const isOwner = mode === "owner";
  const neighbors = await getNeighbors(report.employeeId, report.reportDate, !isOwner);
  const prev = neighbors.prev ? `${manifest.route}/${neighbors.prev.id}` : null;
  const next = neighbors.next ? `${manifest.route}/${neighbors.next.id}` : null;
  const back = isOwner ? `${manifest.route}?tab=mine` : manifest.route;
  const docText = reportToDocText({
    ...report,
    reviewerComments: report.comments.filter((c) => !c.byOwner).map((c) => c.body),
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={back} className="text-brand04 hover:text-brand03 text-sm font-bold transition-colors">
          ‹ {isOwner ? "自分の日報" : "みんなの日報"}
        </Link>
        <nav aria-label="前後の日報" className="flex gap-4 text-sm font-bold">
          {prev ? (
            <Link href={prev} className="text-brand01 hover:text-brand03 transition-colors">
              ‹ 前の日
            </Link>
          ) : null}
          {next ? (
            <Link href={next} className="text-brand01 hover:text-brand03 transition-colors">
              次の日 ›
            </Link>
          ) : null}
        </nav>
      </div>

      <header className="border-brand01/15 flex flex-wrap items-end justify-between gap-4 border bg-white p-5">
        <div>
          <p className="text-brand04 text-xs">
            <span className="font-heading">{report.employeeNumber}</span>
          </p>
          <p className="text-brand01 text-xl font-bold">{report.employeeName}</p>
          <h1 className="text-brand01 font-heading mt-1 text-2xl font-bold tabular-nums">{dateWithWeekday(report.reportDate)}</h1>
          {report.status === "draft" ? <p className="text-brand03 mt-1 text-sm font-bold">下書き(まだ提出していません)</p> : null}
          {report.submittedAt ? (
            <p className="text-brand04 mt-1 text-xs">提出 {DATE_TIME.format(report.submittedAt)}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <p className="text-brand04 text-xs">今日の点数</p>
            <p className="text-xl">
              <Score score={report.score} />
            </p>
            {report.scoreNote ? <p className="text-brand01 max-w-xs text-sm">{report.scoreNote}</p> : null}
          </div>
          {isOwner ? (
            <Link
              href={`${manifest.route}/write?date=${report.reportDate}`}
              className="border-brand01 text-brand01 hover:text-brand03 hover:border-brand03 border bg-white px-4 py-2 text-sm font-bold transition-colors"
            >
              直す
            </Link>
          ) : null}
          <CopyDocButton text={docText} />
        </div>
      </header>

      <Sections report={report} />

      <section aria-label="指導者からのフィードバック" className="border-brand01 flex flex-col gap-4 border-t-2 pt-4">
        <h2 className="text-brand01 text-base font-bold">8. 指導者からのフィードバック</h2>
        {report.comments.length === 0 ? (
          <p className="text-brand04 text-sm">{isOwner ? "まだコメントはありません。" : "まだコメントがありません。最初のコメントを書きましょう。"}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {report.comments.map((c) => (
              <li
                key={c.id}
                className={`flex flex-col gap-1.5 border p-4 ${c.byOwner ? "border-brand01/15 bg-white sm:ml-10" : "border-brand01/20 bg-bg01 sm:mr-10"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-brand01 text-sm font-bold">
                    {c.authorName ?? "(削除されたアカウント)"}
                    <span className="text-brand04 ml-2 text-xs font-normal">{c.byOwner ? "本人" : "指導者"}</span>
                  </p>
                  <p className="text-brand04 text-xs tabular-nums">{DATE_TIME.format(c.createdAt)}</p>
                </div>
                <p className="text-brand01 text-sm leading-relaxed whitespace-pre-wrap">{c.body}</p>
                {c.authorUserId === actor.userId ? <DeleteCommentButton id={c.id} /> : null}
              </li>
            ))}
          </ul>
        )}
        {report.status === "submitted" ? (
          <CommentForm reportId={report.id} isOwner={isOwner} />
        ) : (
          <p className="text-brand04 text-sm">提出すると、指導者からコメントが届きます。</p>
        )}
      </section>
    </div>
  );
}
