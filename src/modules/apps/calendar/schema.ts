import { sql } from "drizzle-orm";
import { check, index, pgSchema, primaryKey, text, timestamp, uuid, date, varchar } from "drizzle-orm/pg-core";
import { audiences } from "@/modules/core/audience/schema";
import { users } from "@/modules/core/auth/schema";
import { employees } from "@/modules/core/employees/schema";
import { COMPANY_EVENT_KINDS, EVENT_RESPONSES, EVENT_VISIBILITIES, type CompanyEventKind, type EventResponse, type EventVisibility } from "./constants";

/** 会社カレンダーアプリの Postgres スキーマ(docs/DESIGN.md 4.1)。 */
export const calendar = pgSchema("calendar");

/**
 * 社員が自分で書き込むメモ・予定。本人だけが見られる個人データ(user_id でスコープする)。
 * 会社の休日は DB ではなく、コード側(company-calendar.ts)に持つ。
 */
export const calendarEntries = calendar.table(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** JST の暦日 */
    date: date("date", { mode: "string" }).notNull(),
    /** 時刻(`HH:MM`)。メモなど時刻のないものは NULL。 */
    time: varchar("time", { length: 5 }),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("entries_user_id_date_idx").on(t.userId, t.date)],
);

export type CalendarEntryRow = typeof calendarEntries.$inferSelect;

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

/**
 * 全社の予定と、参加の呼びかけ(docs/DESIGN.md 38 章)。
 * - paid_leave_day(一斉有給取得日)・temporary_closure(臨時休業)は休みとして数える。全社に表示し、時刻・呼びかけは付けない。
 * - event(行事・予定)は休みにしない。呼びかける相手(名指し・Audience)を付けられる。
 * visibility = company はカレンダーを使える全員に、invitees は登録した本人と相手だけに見せる。
 */
export const calendarCompanyEvents = calendar.table(
  "company_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<CompanyEventKind>().notNull(),
    /** JST の暦日 */
    date: date("date", { mode: "string" }).notNull(),
    /** 時刻(`HH:MM`)。なければ NULL。 */
    time: varchar("time", { length: 5 }),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    visibility: text("visibility").$type<EventVisibility>().notNull(),
    /** 呼びかける相手の条件(見るたびに評価する)。Audience が消えたら NULL(その条件の相手はいなくなる)。 */
    audienceId: uuid("audience_id").references(() => audiences.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("company_events_kind_check", sql`${t.kind} in (${inList(COMPANY_EVENT_KINDS)})`),
    check("company_events_visibility_check", sql`${t.visibility} in (${inList(EVENT_VISIBILITIES)})`),
    check(
      "company_events_off_day_check",
      sql`${t.kind} = 'event' or (${t.visibility} = 'company' and ${t.time} is null and ${t.audienceId} is null)`,
    ),
    index("company_events_date_idx").on(t.date),
    index("company_events_created_by_idx").on(t.createdBy),
    index("company_events_audience_id_idx").on(t.audienceId),
  ],
);

/** 名指しで呼びかけた社員。 */
export const calendarEventInvitees = calendar.table(
  "event_invitees",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarCompanyEvents.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.employeeId] }), index("event_invitees_employee_id_idx").on(t.employeeId)],
);

/** 参加・不参加の返事(アカウントごと)。 */
export const calendarEventResponses = calendar.table(
  "event_responses",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarCompanyEvents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    response: text("response").$type<EventResponse>().notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    check("event_responses_response_check", sql`${t.response} in (${inList(EVENT_RESPONSES)})`),
    index("event_responses_user_id_idx").on(t.userId),
  ],
);

export type CompanyEventRow = typeof calendarCompanyEvents.$inferSelect;
