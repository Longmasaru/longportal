import { index, pgSchema, text, timestamp, uuid, date, varchar } from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";

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
