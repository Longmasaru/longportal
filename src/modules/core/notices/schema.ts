import { sql } from "drizzle-orm";
import { boolean, check, date, index, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { audiences } from "../audience/schema";
import { users } from "../auth/schema";
import { employees } from "../employees/schema";
import { core, idColumn, timestamps } from "../shared/schema-helpers";

// お知らせ(docs/DESIGN.md 23 章)。個人用と全社用でテーブルを分けず、target で宛先を表す。

import {
  NOTICE_KINDS,
  NOTICE_PRIORITIES,
  NOTICE_STATUSES,
  NOTICE_TARGETS,
  type NoticeKind,
  type NoticePriority,
  type NoticeStatus,
  type NoticeTarget,
} from "./constants";

export {
  NOTICE_KINDS,
  NOTICE_PRIORITIES,
  NOTICE_STATUSES,
  NOTICE_TARGETS,
  type NoticeKind,
  type NoticePriority,
  type NoticeStatus,
  type NoticeTarget,
};

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

export const announcements = core.table(
  "announcements",
  {
    id: idColumn(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    kind: text("kind").$type<NoticeKind>().notNull().default("general"),
    priority: text("priority").$type<NoticePriority>().notNull().default("normal"),
    target: text("target").$type<NoticeTarget>().notNull(),
    /** target = audience のときだけ使う(必須)。 */
    audienceId: uuid("audience_id").references(() => audiences.id, { onDelete: "restrict" }),
    /** 確認ボタンを出す(要対応)。 */
    requiresAction: boolean("requires_action").notNull().default(false),
    status: text("status").$type<NoticeStatus>().notNull().default("draft"),
    /** 掲載開始日(JST の暦日)。 */
    publishedOn: date("published_on", { mode: "string" }).notNull(),
    /** 掲載の最終日(この日まで表示)。NULL は無期限。 */
    expiresOn: date("expires_on", { mode: "string" }),
    /** ホーム上部のバナーの最終日。全社宛の緊急のときだけ。 */
    bannerUntil: date("banner_until", { mode: "string" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    check("announcements_kind_check", sql`${t.kind} in (${inList(NOTICE_KINDS)})`),
    check("announcements_priority_check", sql`${t.priority} in (${inList(NOTICE_PRIORITIES)})`),
    check("announcements_target_check", sql`${t.target} in (${inList(NOTICE_TARGETS)})`),
    check("announcements_status_check", sql`${t.status} in (${inList(NOTICE_STATUSES)})`),
    check(
      "announcements_audience_check",
      sql`(${t.target} = 'audience') = (${t.audienceId} is not null)`,
    ),
    check(
      "announcements_banner_check",
      sql`${t.bannerUntil} is null or (${t.target} = 'company' and ${t.priority} = 'urgent')`,
    ),
    check(
      "announcements_period_check",
      sql`${t.expiresOn} is null or ${t.expiresOn} >= ${t.publishedOn}`,
    ),
    index("announcements_status_published_on_idx").on(t.status, t.publishedOn),
    index("announcements_audience_id_idx").on(t.audienceId),
  ],
);

/** target = individual の宛先。 */
export const announcementRecipients = core.table(
  "announcement_recipients",
  {
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.announcementId, t.employeeId] }),
    index("announcement_recipients_employee_id_idx").on(t.employeeId),
  ],
);

/** 本人ごとの状態(既読・確認済み)。 */
export const announcementReads = core.table(
  "announcement_reads",
  {
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.announcementId, t.userId] }),
    index("announcement_reads_user_id_idx").on(t.userId),
  ],
);

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
