import { sql } from "drizzle-orm";
import { boolean, check, date, index, pgSchema, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";
import { employees } from "@/modules/core/employees/schema";
import type { ReportStatus } from "./labels";

/** 日報アプリの Postgres スキーマ(docs/DESIGN.md 4.1・37 章)。 */
export const nippo = pgSchema("nippo");

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

const textColumn = (name: string) => text(name).notNull().default("");

/**
 * 日報(1 人 1 日 1 件)。人(employee)に付く記録なので employee_id に紐づける。
 * 下書きは本人だけが見る。指導者に見えるのは status = 'submitted' の行だけ。
 */
export const nippoReports = nippo.table(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /** JST の暦日(日報の日付) */
    reportDate: date("report_date", { mode: "string" }).notNull(),
    status: text("status").$type<ReportStatus>().notNull().default("draft"),
    training: textColumn("training"),
    topLearning: textColumn("top_learning"),
    taught: textColumn("taught"),
    asked: textColumn("asked"),
    noticed: textColumn("noticed"),
    canDo: textColumn("can_do"),
    difficult: textColumn("difficult"),
    unclear: textColumn("unclear"),
    tomorrow: textColumn("tomorrow"),
    /** 今日の点数(1〜10)。未記入は null。 */
    score: smallint("score"),
    scoreNote: textColumn("score_note"),
    /** 最初に提出した日時。下書きは null。 */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** 書いた人のアカウント。アカウントが消えても日報は残す。 */
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    check("reports_status_check", sql`${t.status} in ('draft', 'submitted')`),
    check("reports_score_check", sql`${t.score} is null or ${t.score} between 1 and 10`),
    check("reports_submitted_at_check", sql`(${t.status} = 'draft') = (${t.submittedAt} is null)`),
    uniqueIndex("reports_employee_id_report_date_idx").on(t.employeeId, t.reportDate),
    index("reports_status_report_date_idx").on(t.status, t.reportDate),
  ],
);

/**
 * 日報へのコメント(指導者のフィードバックと、本人の返信)。
 * by_owner は「日報を書いた本人のコメント」か。コメント待ちの判定(本人以外のコメントがあるか)に使う。
 */
export const nippoComments = nippo.table(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => nippoReports.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    byOwner: boolean("by_owner").notNull().default(false),
    body: text("body").notNull(),
    ...timestamps(),
  },
  (t) => [index("comments_report_id_created_at_idx").on(t.reportId, t.createdAt)],
);

export type NippoReportRow = typeof nippoReports.$inferSelect;
export type NippoCommentRow = typeof nippoComments.$inferSelect;
