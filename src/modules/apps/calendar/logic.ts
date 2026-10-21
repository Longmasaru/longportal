// 会社カレンダーの判定(タイムゾーンの影響を受けない純粋関数)。日付はすべて JST の暦日 `YYYY-MM-DD`。
import { addDays } from "@/modules/core/shared/date";
import { COMPANY_CALENDAR, type CompanyYear } from "./company-calendar";
import type { OffEventKind } from "./constants";

/** 会社カレンダー(年 → その年の休日)。全社の休みを重ねたものも同じ形(events.ts の withCompanyOffDays)。 */
export type CompanyCalendar = Record<number, CompanyYear>;

/** off = 休み、work = 出勤日、unknown = その年の会社カレンダーが未登録。 */
export type DayKind = "off" | "work" | "unknown";

export type CalendarDay = {
  date: string;
  /** 0 = 日曜 … 6 = 土曜 */
  weekday: number;
  kind: DayKind;
  /** 祝日・休暇の名称など(なければ null) */
  label: string | null;
  /** 出勤する土曜か */
  isWorkSaturday: boolean;
  /** 全社の休み(一斉有給取得日・臨時休業)なら、その種類 */
  offEvent: OffEventKind | null;
};

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

export function weekdayOf(date: string): number {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function hasCompanyYear(year: number, calendar: Record<number, CompanyYear> = COMPANY_CALENDAR): boolean {
  return calendar[year] !== undefined;
}

export function dayInfo(date: string, calendar: Record<number, CompanyYear> = COMPANY_CALENDAR): CalendarDay {
  const [y] = parts(date);
  const md = date.slice(5);
  const weekday = weekdayOf(date);
  const year = calendar[y];
  if (!year) return { date, weekday, kind: "unknown", label: null, isWorkSaturday: false, offEvent: null };

  const extra = year.extraOffDays?.[md];
  // 出勤土曜が臨時休業などで休みになったら、出勤土曜として扱わない
  const isWorkSaturday = weekday === 6 && year.workSaturdays.includes(md) && !extra;
  const weekdayHoliday = weekday >= 1 && weekday <= 5 ? year.weekdayHolidays[md] : undefined;
  const isWeekendOff = (weekday === 0 || weekday === 6) && !isWorkSaturday;
  const kind: DayKind = extra || weekdayHoliday !== undefined || isWeekendOff ? "off" : "work";
  const label = weekdayHoliday ?? extra?.title ?? year.notes[md] ?? null;
  return { date, weekday, kind, label, isWorkSaturday, offEvent: extra?.kind ?? null };
}

/** `YYYY-MM` の月の日数 */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 月の表(日曜はじまり)。前後の空きは null。 */
export function monthGrid(month: string, calendar: CompanyCalendar = COMPANY_CALENDAR): (CalendarDay | null)[][] {
  const first = `${month}-01`;
  const lead = weekdayOf(first);
  const cells: (CalendarDay | null)[] = Array.from({ length: lead }, () => null);
  for (let i = 0; i < daysInMonth(month); i++) cells.push(dayInfo(addDays(first, i), calendar));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** `YYYY-MM` に月数を足す */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** URL などから受け取った `YYYY-MM` を検証する。不正なら null。 */
export function parseMonth(value: string | undefined): string | null {
  if (!value) return null;
  const m = MONTH.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  return year >= 2000 && year <= 2100 ? value : null;
}

/** today より後で最初の休み(登録済みの範囲で探す)。 */
export function nextOffDay(today: string, calendar: CompanyCalendar = COMPANY_CALENDAR, limitDays = 120): CalendarDay | null {
  for (let i = 1; i <= limitDays; i++) {
    const day = dayInfo(addDays(today, i), calendar);
    if (day.kind === "unknown") return null;
    if (day.kind === "off") return day;
  }
  return null;
}

/** today を含む、その月の残りの出勤日数(会社カレンダー未登録なら null)。 */
export function remainingWorkdays(today: string, calendar: CompanyCalendar = COMPANY_CALENDAR): number | null {
  const month = today.slice(0, 7);
  let count = 0;
  for (let d = today; d.startsWith(month); d = addDays(d, 1)) {
    const day = dayInfo(d, calendar);
    if (day.kind === "unknown") return null;
    if (day.kind === "work") count++;
  }
  return count;
}

/** 年間の集計(休日数・出勤土曜) */
export function yearSummary(
  year: number,
  calendar: CompanyCalendar = COMPANY_CALENDAR,
): { offDays: number; workDays: number; workSaturdays: string[] } | null {
  if (!hasCompanyYear(year, calendar)) return null;
  let offDays = 0;
  let workDays = 0;
  const workSaturdays: string[] = [];
  for (let d = `${year}-01-01`; d.startsWith(String(year)); d = addDays(d, 1)) {
    const day = dayInfo(d, calendar);
    if (day.kind === "off") offDays++;
    else workDays++;
    if (day.isWorkSaturday) workSaturdays.push(d);
  }
  return { offDays, workDays, workSaturdays };
}

/** 表示用の `MM.DD(曜)` */
export function shortDate(date: string): string {
  return `${date.slice(5, 7)}.${date.slice(8, 10)}(${WEEKDAY_LABELS[weekdayOf(date)]})`;
}
