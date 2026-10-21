import { and, asc, count, desc, eq, gte, inArray, isNull, lte, max, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Actor } from "@/modules/core/access";
import { users } from "@/modules/core/auth/schema";
import { employeeAssignments, employees } from "@/modules/core/employees/schema";
import { canReviewEmployee, reportMode, type ReportMode, type TargetAssignment } from "./logic";
import type { ReportStatus } from "./labels";
import { NIPPO_REPORTS_REVIEW } from "./manifest";
import { nippoComments, nippoReports } from "./schema";
import type { ReportComment, ReportDetail, ReportSummary, Writer } from "./types";

/** 基準日(JST)に有効な所属。employeeIds を省略すると全社員。 */
async function currentAssignments(today: string, employeeIds?: string[]): Promise<Map<string, TargetAssignment[]>> {
  if (employeeIds && employeeIds.length === 0) return new Map();
  const rows = await db
    .select({
      employeeId: employeeAssignments.employeeId,
      locationId: employeeAssignments.locationId,
      departmentId: employeeAssignments.departmentId,
    })
    .from(employeeAssignments)
    .where(
      and(
        employeeIds ? inArray(employeeAssignments.employeeId, employeeIds) : undefined,
        lte(employeeAssignments.startDate, today),
        or(isNull(employeeAssignments.endDate), gte(employeeAssignments.endDate, today)),
      ),
    );
  const map = new Map<string, TargetAssignment[]>();
  for (const { employeeId, ...a } of rows) {
    const list = map.get(employeeId) ?? [];
    list.push(a);
    map.set(employeeId, list);
  }
  return map;
}

/** 日報ごとのコメントの数(本人以外 / 本人)と、最後のコメントの日時。 */
const commentStats = db
  .select({
    reportId: nippoComments.reportId,
    reviewer: sql<number>`count(*) filter (where not ${nippoComments.byOwner})`.mapWith(Number).as("reviewer"),
    owner: sql<number>`count(*) filter (where ${nippoComments.byOwner})`.mapWith(Number).as("owner"),
    last: max(nippoComments.createdAt).as("last"),
  })
  .from(nippoComments)
  .groupBy(nippoComments.reportId)
  .as("comment_stats");

const summaryColumns = {
  id: nippoReports.id,
  employeeId: nippoReports.employeeId,
  employeeName: employees.name,
  employeeNumber: employees.employeeNumber,
  reportDate: nippoReports.reportDate,
  status: nippoReports.status,
  training: nippoReports.training,
  score: nippoReports.score,
  submittedAt: nippoReports.submittedAt,
  reviewerComments: sql<number>`coalesce(${commentStats.reviewer}, 0)`.mapWith(Number),
  ownerComments: sql<number>`coalesce(${commentStats.owner}, 0)`.mapWith(Number),
  lastCommentAt: commentStats.last,
};

/** 自分の日報(新しい順。下書きも含む)。 */
export async function listOwnReports(employeeId: string): Promise<ReportSummary[]> {
  return db
    .select(summaryColumns)
    .from(nippoReports)
    .innerJoin(employees, eq(nippoReports.employeeId, employees.id))
    .leftJoin(commentStats, eq(commentStats.reportId, nippoReports.id))
    .where(eq(nippoReports.employeeId, employeeId))
    .orderBy(desc(nippoReports.reportDate));
}

/** 指導者が読める、提出済みの日報を書いた人の id(スコープで絞る)。 */
async function reviewableEmployeeIds(actor: Actor, candidateIds: string[]): Promise<Set<string>> {
  const assignmentMap = await currentAssignments(actor.today, candidateIds);
  return new Set(
    candidateIds.filter(
      (id) => id !== actor.employee?.id && canReviewEmployee(actor.grants, NIPPO_REPORTS_REVIEW, assignmentMap.get(id) ?? []),
    ),
  );
}

/** 提出済みの日報を書いている社員(自分を除く)。 */
async function submittedWriterIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ employeeId: nippoReports.employeeId })
    .from(nippoReports)
    .where(eq(nippoReports.status, "submitted"));
  return rows.map((r) => r.employeeId);
}

/** 指導者の一覧の絞り込みに出す社員(スコープ内で、提出済みの日報がある人)。 */
export async function listWriters(actor: Actor): Promise<Writer[]> {
  const allowed = await reviewableEmployeeIds(actor, await submittedWriterIds());
  if (allowed.size === 0) return [];
  return db
    .select({ id: employees.id, name: employees.name, employeeNumber: employees.employeeNumber })
    .from(employees)
    .where(inArray(employees.id, [...allowed]))
    .orderBy(asc(employees.employeeNumber));
}

/**
 * 指導者の一覧(スコープ内の社員の、提出済みの日報。新しい順)。
 * pendingOnly のときは、本人以外のコメントがまだない日報だけ。
 */
export async function listReviewReports(
  actor: Actor,
  options: { pendingOnly: boolean; employeeId?: string; limit?: number },
): Promise<ReportSummary[]> {
  const allowed = await reviewableEmployeeIds(actor, await submittedWriterIds());
  const ids = options.employeeId ? [...allowed].filter((id) => id === options.employeeId) : [...allowed];
  if (ids.length === 0) return [];
  return db
    .select(summaryColumns)
    .from(nippoReports)
    .innerJoin(employees, eq(nippoReports.employeeId, employees.id))
    .leftJoin(commentStats, eq(commentStats.reportId, nippoReports.id))
    .where(
      and(
        eq(nippoReports.status, "submitted"),
        inArray(nippoReports.employeeId, ids),
        options.pendingOnly ? sql`coalesce(${commentStats.reviewer}, 0) = 0` : undefined,
      ),
    )
    .orderBy(desc(nippoReports.reportDate), asc(employees.employeeNumber))
    .limit(options.limit ?? 200);
}

/** コメント待ちの日報の数(ホームの要対応)。 */
export async function countAwaitingComment(actor: Actor): Promise<number> {
  const allowed = await reviewableEmployeeIds(actor, await submittedWriterIds());
  if (allowed.size === 0) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(nippoReports)
    .leftJoin(commentStats, eq(commentStats.reportId, nippoReports.id))
    .where(
      and(
        eq(nippoReports.status, "submitted"),
        inArray(nippoReports.employeeId, [...allowed]),
        sql`coalesce(${commentStats.reviewer}, 0) = 0`,
      ),
    );
  return row?.n ?? 0;
}

/** 自分の、日報の有無と今日の日報の状態(ホームの要対応)。 */
export async function getOwnStatus(employeeId: string, today: string): Promise<{ hasAny: boolean; todayStatus: ReportStatus | null }> {
  const rows = await db
    .select({ reportDate: nippoReports.reportDate, status: nippoReports.status })
    .from(nippoReports)
    .where(eq(nippoReports.employeeId, employeeId))
    .orderBy(desc(nippoReports.reportDate))
    .limit(1);
  const [todayRow] = await db
    .select({ status: nippoReports.status })
    .from(nippoReports)
    .where(and(eq(nippoReports.employeeId, employeeId), eq(nippoReports.reportDate, today)))
    .limit(1);
  return { hasAny: rows.length > 0, todayStatus: todayRow?.status ?? null };
}

/** 自分の、ある日の日報(書く画面の初期値)。 */
export async function getOwnReportByDate(employeeId: string, reportDate: string) {
  const [row] = await db
    .select()
    .from(nippoReports)
    .where(and(eq(nippoReports.employeeId, employeeId), eq(nippoReports.reportDate, reportDate)))
    .limit(1);
  return row ?? null;
}

/** 日報 1 件(Server Action の確認用。本文なしの最小限)。 */
export async function getReportRow(id: string) {
  const [row] = await db.select().from(nippoReports).where(eq(nippoReports.id, id)).limit(1);
  return row ?? null;
}

/** 見る人と日報の関係から、見え方を決める(書いた社員の今日の所属でスコープを判定)。 */
export async function modeForReport(
  actor: Actor,
  report: { employeeId: string; status: ReportStatus },
): Promise<ReportMode> {
  if (actor.employee?.id === report.employeeId) return "owner";
  const assignments = (await currentAssignments(actor.today, [report.employeeId])).get(report.employeeId) ?? [];
  const canReview = canReviewEmployee(actor.grants, NIPPO_REPORTS_REVIEW, assignments);
  return reportMode(actor.employee?.id ?? null, report.employeeId, report.status, canReview);
}

/** コメント 1 件(削除の前の確認用)。 */
export async function getComment(id: string) {
  const [row] = await db.select().from(nippoComments).where(eq(nippoComments.id, id)).limit(1);
  return row ?? null;
}

async function listComments(reportId: string): Promise<ReportComment[]> {
  return db
    .select({
      id: nippoComments.id,
      body: nippoComments.body,
      byOwner: nippoComments.byOwner,
      authorUserId: nippoComments.authorUserId,
      authorName: employees.name,
      createdAt: nippoComments.createdAt,
      updatedAt: nippoComments.updatedAt,
    })
    .from(nippoComments)
    .leftJoin(users, eq(nippoComments.authorUserId, users.id))
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .where(eq(nippoComments.reportId, reportId))
    .orderBy(asc(nippoComments.createdAt));
}

/** 日報 1 件の画面(見え方の判定は呼ぶ側で行う)。 */
export async function getReportDetail(id: string): Promise<ReportDetail | null> {
  const [row] = await db
    .select({ report: nippoReports, employeeName: employees.name, employeeNumber: employees.employeeNumber })
    .from(nippoReports)
    .innerJoin(employees, eq(nippoReports.employeeId, employees.id))
    .where(eq(nippoReports.id, id))
    .limit(1);
  if (!row) return null;
  const r = row.report;
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: row.employeeName,
    employeeNumber: row.employeeNumber,
    reportDate: r.reportDate,
    status: r.status,
    submittedAt: r.submittedAt,
    updatedAt: r.updatedAt,
    training: r.training,
    topLearning: r.topLearning,
    taught: r.taught,
    asked: r.asked,
    noticed: r.noticed,
    canDo: r.canDo,
    difficult: r.difficult,
    unclear: r.unclear,
    tomorrow: r.tomorrow,
    score: r.score,
    scoreNote: r.scoreNote,
    comments: await listComments(r.id),
  };
}

/** 前後の日報(同じ人・見る人に見えるものだけ)。日報の画面の「前の日 / 次の日」。 */
export async function getNeighbors(
  employeeId: string,
  reportDate: string,
  submittedOnly: boolean,
): Promise<{ prev: { id: string; reportDate: string } | null; next: { id: string; reportDate: string } | null }> {
  const base = and(eq(nippoReports.employeeId, employeeId), submittedOnly ? eq(nippoReports.status, "submitted") : undefined);
  const cols = { id: nippoReports.id, reportDate: nippoReports.reportDate };
  const [[prev], [next]] = await Promise.all([
    db
      .select(cols)
      .from(nippoReports)
      .where(and(base, sql`${nippoReports.reportDate} < ${reportDate}`))
      .orderBy(desc(nippoReports.reportDate))
      .limit(1),
    db
      .select(cols)
      .from(nippoReports)
      .where(and(base, sql`${nippoReports.reportDate} > ${reportDate}`))
      .orderBy(asc(nippoReports.reportDate))
      .limit(1),
  ]);
  return { prev: prev ?? null, next: next ?? null };
}
