import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
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

/** 本人の入社日と生年月日(入社の周年・誕生日の表示用)。社員でない user は両方 null。 */
export async function getPersonalDates(
  employeeId: string | null | undefined,
): Promise<{ hiredOn: string | null; birthDate: string | null }> {
  if (!employeeId) return { hiredOn: null, birthDate: null };
  const [row] = await db
    .select({ hiredOn: employees.hiredOn, birthDate: employees.birthDate })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return { hiredOn: row?.hiredOn ?? null, birthDate: row?.birthDate ?? null };
}

/**
 * 在籍中(今日の時点で active / leave、入社済み、退職日が今日以降か未定)で、生年月日の入っている社員。
 * 全社員の誕生日を見る権限(calendar.birthdays.view)のある人の画面だけで使う。docs/DESIGN.md 37 章。
 */
export async function listBirthdays(today: string): Promise<{ employeeId: string; name: string; birthDate: string }[]> {
  const rows = await db
    .select({ employeeId: employees.id, name: employees.name, birthDate: employees.birthDate })
    .from(employees)
    .where(
      and(
        isNotNull(employees.birthDate),
        inArray(employees.status, ["active", "leave"]),
        lte(employees.hiredOn, today),
        or(isNull(employees.leftOn), gte(employees.leftOn, today)),
      ),
    )
    .orderBy(asc(employees.employeeNumber));
  return rows.flatMap((r) => (r.birthDate ? [{ employeeId: r.employeeId, name: r.name, birthDate: r.birthDate }] : []));
}
