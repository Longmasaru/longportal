import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { employees } from "@/modules/core/employees/schema";
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

/** 本人の入社日(入社の周年の表示用)。社員でない user は null。 */
export async function getHiredOn(employeeId: string | null | undefined): Promise<string | null> {
  if (!employeeId) return null;
  const [row] = await db
    .select({ hiredOn: employees.hiredOn })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return row?.hiredOn ?? null;
}
