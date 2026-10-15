import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { calendarEntries } from "./schema";
import type { CalendarEntry } from "./types";

/** 本人のメモ・予定(期間指定。両端を含む)。時刻のないもの(メモ)を先に並べる。 */
export async function listEntries(userId: string, from: string, to: string): Promise<CalendarEntry[]> {
  return db
    .select({
      id: calendarEntries.id,
      date: calendarEntries.date,
      time: calendarEntries.time,
      title: calendarEntries.title,
      note: calendarEntries.note,
    })
    .from(calendarEntries)
    .where(
      and(eq(calendarEntries.userId, userId), gte(calendarEntries.date, from), lte(calendarEntries.date, to)),
    )
    .orderBy(
      asc(calendarEntries.date),
      sql`${calendarEntries.time} asc nulls first`,
      asc(calendarEntries.createdAt),
    );
}
