// 会社カレンダーの「お知らせ」と「楽しみ」(連休・出勤土曜・入社の周年・給料日)。docs/DESIGN.md 33 章。
// タイムゾーンの影響を受けない純粋関数。日付はすべて JST の暦日 `YYYY-MM-DD`。
import { addDays, diffDays } from "@/modules/core/shared/date";
import { COMPANY_CALENDAR, PAYDAY, type CompanyYear } from "./company-calendar";
import { dayInfo, daysInMonth } from "./logic";

/** 休みが続く期間(連休)。 */
export type LongHoliday = {
  start: string;
  /** 登録済みの範囲での最後の日 */
  end: string;
  days: number;
  name: string;
  /** 翌年の会社カレンダーが未登録で、そこで途切れている */
  truncated: boolean;
};

/** 連休とみなす日数 */
export const LONG_HOLIDAY_MIN_DAYS = 3;

function holidayName(start: string, end: string, days: number, labels: string[]): string {
  if (labels.some((l) => l === "年末年始休暇" || l === "元日")) return "年末年始休暇";
  const year = start.slice(0, 4);
  if (start <= `${year}-05-05` && end >= `${year}-05-03`) return "ゴールデンウィーク";
  if (labels.includes("夏季休暇")) return "夏季休暇";
  return `${days}連休`;
}

/** start から続く休みを数える(start が休みでなければ null)。 */
function offRunFrom(start: string, calendar: Record<number, CompanyYear>): LongHoliday | null {
  if (dayInfo(start, calendar).kind !== "off") return null;
  // 前にも休みが続いていれば、その始まりまで戻る
  let first = start;
  while (dayInfo(addDays(first, -1), calendar).kind === "off") first = addDays(first, -1);
  let end = first;
  const labels: string[] = [];
  let hasNamedHoliday = false;
  for (let d = first; ; d = addDays(d, 1)) {
    const info = dayInfo(d, calendar);
    if (info.kind !== "off") {
      const truncated = info.kind === "unknown";
      const days = diffDays(first, end) + 1;
      if (days < LONG_HOLIDAY_MIN_DAYS && !(truncated && hasNamedHoliday)) return null;
      return { start: first, end, days, name: holidayName(first, end, days, labels), truncated };
    }
    end = d;
    if (info.label) labels.push(info.label);
    // 土日以外の休み(祝日・休暇)があるか
    if (info.weekday >= 1 && info.weekday <= 5) hasNamedHoliday = true;
  }
}

/**
 * 今日を含む連休、またはこれから来る最初の連休(登録済みの範囲で探す)。
 * 見つからなければ null。
 */
export function nextLongHoliday(
  today: string,
  calendar: Record<number, CompanyYear> = COMPANY_CALENDAR,
  limitDays = 400,
): LongHoliday | null {
  for (let i = 0; i <= limitDays; i++) {
    const d = addDays(today, i);
    const info = dayInfo(d, calendar);
    if (info.kind === "unknown") return null;
    if (info.kind !== "off") continue;
    const run = offRunFrom(d, calendar);
    if (run && run.end >= today) return run;
    // この休みの続きを飛ばす
    while (dayInfo(addDays(today, i + 1), calendar).kind === "off") i++;
  }
  return null;
}

/** 次の出勤日(today より後。登録済みの範囲で探す)。 */
export function nextWorkday(today: string, calendar: Record<number, CompanyYear> = COMPANY_CALENDAR, limitDays = 60): string | null {
  for (let i = 1; i <= limitDays; i++) {
    const d = addDays(today, i);
    const info = dayInfo(d, calendar);
    if (info.kind === "unknown") return null;
    if (info.kind === "work") return d;
  }
  return null;
}

export type Highlight =
  | { kind: "work_saturday_today"; date: string }
  | { kind: "work_saturday_next"; date: string; daysUntil: number }
  | { kind: "holiday_tomorrow"; holiday: LongHoliday }
  | { kind: "anniversary"; years: number }
  | { kind: "birthday" }
  | { kind: "birthdays"; names: string[] }
  | { kind: "payday"; date: string };

/** 誕生日のある人(全社員の誕生日を見る権限のある人の画面だけで渡す)。 */
export type BirthdayPerson = { employeeId: string; name: string; birthDate: string };

/** 入社記念日(その年の)。2/29 入社の人は、平年は 2/28。 */
export function anniversaryDate(hiredOn: string, year: number): string {
  const md = hiredOn.slice(5);
  if (md === "02-29" && daysInMonth(`${year}-02`) === 28) return `${year}-02-28`;
  return `${year}-${md}`;
}

/** その日(`YYYY-MM-DD`)が誕生日の人。2/29 生まれの人は、平年は 2/28。 */
export function birthdaysOn<T extends { birthDate: string }>(people: readonly T[], date: string): T[] {
  const year = Number(date.slice(0, 4));
  return people.filter((p) => anniversaryDate(p.birthDate, year) === date);
}

/** 今日が入社の周年なら年数(1 年目の記念日 = 1)。それ以外は null。 */
export function anniversaryYears(hiredOn: string, today: string): number | null {
  const year = Number(today.slice(0, 4));
  const years = year - Number(hiredOn.slice(0, 4));
  if (years < 1) return null;
  return anniversaryDate(hiredOn, year) === today ? years : null;
}

/**
 * `YYYY-MM` の月の給料日。日にちが未設定(null)なら null。
 * その月にない日は月末。休みに当たるときは前の出勤日へずらす(会社カレンダー未登録の月はずらさない)。
 */
export function paydayOf(month: string, payday: number | null = PAYDAY, calendar: Record<number, CompanyYear> = COMPANY_CALENDAR): string | null {
  if (payday === null) return null;
  const day = Math.min(payday, daysInMonth(month));
  let date = `${month}-${String(day).padStart(2, "0")}`;
  for (let i = 0; i < 31 && dayInfo(date, calendar).kind === "off"; i++) date = addDays(date, -1);
  return date;
}

/**
 * 今日、知らせたいこと(大事な順)。
 * - 出勤土曜: 当日と、次の出勤日が出勤土曜になる日(ふつうは金曜)
 * - 明日から連休
 * - 本人の誕生日(birthDate がある人だけ)・入社の周年(hiredOn がある人だけ)
 * - ほかの人の誕生日(others を渡したときだけ。本人は除いて渡す)
 * - 給料日(PAYDAY が設定されているときだけ)
 */
export function todaysHighlights(
  today: string,
  options: {
    hiredOn?: string | null;
    birthDate?: string | null;
    others?: readonly BirthdayPerson[];
    payday?: number | null;
    /** 全社の休みを重ねた会社カレンダー(events.ts の withCompanyOffDays) */
    calendar?: Record<number, CompanyYear>;
    /** 給料日のずらしに使う会社カレンダー。一斉有給取得日などでは振り込み日は変わらないため、既定は紙の会社カレンダー(38.1) */
    paydayCalendar?: Record<number, CompanyYear>;
  } = {},
): Highlight[] {
  const calendar = options.calendar ?? COMPANY_CALENDAR;
  const paydayCalendar = options.paydayCalendar ?? COMPANY_CALENDAR;
  const payday = options.payday === undefined ? PAYDAY : options.payday;
  const result: Highlight[] = [];

  const todayInfo = dayInfo(today, calendar);
  if (todayInfo.isWorkSaturday) {
    result.push({ kind: "work_saturday_today", date: today });
  } else {
    const next = nextWorkday(today, calendar);
    if (next && dayInfo(next, calendar).isWorkSaturday) {
      result.push({ kind: "work_saturday_next", date: next, daysUntil: diffDays(today, next) });
    }
  }

  if (todayInfo.kind === "work") {
    const tomorrow = addDays(today, 1);
    const run = offRunFrom(tomorrow, calendar);
    if (run && run.start === tomorrow) result.push({ kind: "holiday_tomorrow", holiday: run });
  }

  if (options.birthDate && birthdaysOn([{ birthDate: options.birthDate }], today).length > 0) {
    result.push({ kind: "birthday" });
  }

  if (options.hiredOn) {
    const years = anniversaryYears(options.hiredOn, today);
    if (years !== null) result.push({ kind: "anniversary", years });
  }

  if (options.others) {
    const names = birthdaysOn(options.others, today).map((p) => p.name);
    if (names.length > 0) result.push({ kind: "birthdays", names });
  }

  if (paydayOf(today.slice(0, 7), payday, paydayCalendar) === today) result.push({ kind: "payday", date: today });

  return result;
}
