import Link from "next/link";
import type { ReactNode } from "react";
import { canGlobally } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { addDays, diffDays } from "@/modules/core/shared/date";
import { todayJst } from "@/modules/core/shared/jst";
import {
  addMonths,
  daysInMonth,
  dayInfo,
  hasCompanyYear,
  monthGrid,
  nextOffDay,
  remainingWorkdays,
  shortDate,
  yearSummary,
} from "../logic";
import { dailyNote } from "../daily-notes";
import { anniversaryDate, birthdaysOn, nextLongHoliday, paydayOf, todaysHighlights } from "../highlights";
import { CALENDAR_BIRTHDAYS_VIEW, manifest } from "../manifest";
import { getPersonalDates, listBirthdays, listEntries } from "../queries";
import { HighlightList } from "./highlight-list";
import { MonthBoard } from "./month-board";

function SummaryCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-brand01/15 flex flex-col gap-1 border bg-white p-4">
      <p className="text-brand04 text-xs font-bold tracking-widest">{label}</p>
      <div className="text-brand01 font-bold">{children}</div>
    </div>
  );
}

const NAV_LINK =
  "border-brand01/20 text-brand01 hover:border-brand03 hover:text-brand03 border bg-white px-3 py-1.5 text-sm font-bold transition-colors";

/** 会社カレンダー。会社の休日(全社員共通)と、本人だけのメモ・予定を月の表で見る。アプリ管理で有効にし、表示する相手に当てはまる人だけ(それ以外は 404)。 */
export async function CalendarPage({ month }: { month: string | null }) {
  const actor = await requireAppAccess(manifest.appKey);

  const today = todayJst();
  const current = month ?? today.slice(0, 7);
  const first = `${current}-01`;
  const last = `${current}-${String(daysInMonth(current)).padStart(2, "0")}`;
  const [entries, mine, everyone] = await Promise.all([
    listEntries(actor.userId, first, last),
    getPersonalDates(actor.employee?.id),
    canGlobally(actor, CALENDAR_BIRTHDAYS_VIEW) ? listBirthdays(today) : Promise.resolve(null),
  ]);
  const { hiredOn, birthDate } = mine;
  // ほかの人の誕生日(権限のある人だけ)。本人の誕生日は「誕生日」の印で別に出す。
  const others = everyone?.filter((p) => p.employeeId !== actor.employee?.id);

  const todayInfo = dayInfo(today);
  const nextOff = nextOffDay(today);
  const remaining = remainingWorkdays(today);
  const year = Number(current.slice(0, 4));
  const summary = yearSummary(year);
  const highlights = todaysHighlights(today, { hiredOn, birthDate, others });
  const longHoliday = nextLongHoliday(today);

  // 月の表に付ける印(給料日・本人の入社記念日)
  const marks: Record<string, string[]> = {};
  const addMark = (date: string, label: string) => {
    if (date.startsWith(current)) marks[date] = [...(marks[date] ?? []), label];
  };
  const payday = paydayOf(current);
  if (payday) addMark(payday, "給料日");
  if (hiredOn && year > Number(hiredOn.slice(0, 4))) addMark(anniversaryDate(hiredOn, year), "入社記念日");
  if (birthDate) addMark(anniversaryDate(birthDate, year), "誕生日");
  if (others) {
    for (let d = first; d <= last; d = addDays(d, 1)) {
      for (const p of birthdaysOn(others, d)) addMark(d, `${p.name}さん誕生日`);
    }
  }
  const href = (m: string) => `/apps/calendar?month=${m}`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <div>
        <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
          CALENDAR<span className="text-brand04 ml-3 font-medium tracking-[0.1em]">会社カレンダー</span>
        </p>
        <h1 className="text-brand01 mt-2 text-2xl font-bold">会社カレンダー</h1>
        <p className="text-brand04 mt-1 text-sm">
          会社の休日と出勤日を確認できます。日付を押すと、自分のメモや予定を書き込めます(自分にしか見えません)。
        </p>
      </div>

      <HighlightList items={highlights} />

      <p className="border-brand01/15 text-brand01 border-y py-3 text-sm leading-relaxed">
        <span className="text-brand03 mr-2 text-xs font-bold tracking-widest">今日のひとこと</span>
        {dailyNote(today)}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="今日">
          {shortDate(today)}{" "}
          {todayInfo.kind === "unknown" ? (
            <span className="text-brand04 text-sm">(未登録)</span>
          ) : todayInfo.kind === "off" ? (
            <span className="text-brand03">休み</span>
          ) : (
            <span>出勤日</span>
          )}
          {todayInfo.label ? <span className="text-brand04 ml-2 text-sm font-medium">{todayInfo.label}</span> : null}
        </SummaryCard>
        <SummaryCard label="次の休み">
          {nextOff ? (
            <>
              {shortDate(nextOff.date)}
              {nextOff.label ? <span className="text-brand04 ml-2 text-sm font-medium">{nextOff.label}</span> : null}
            </>
          ) : (
            <span className="text-brand04 text-sm">まだ登録されていません</span>
          )}
        </SummaryCard>
        <SummaryCard label={longHoliday && longHoliday.start <= today ? "連休中" : "次の連休まで"}>
          {!longHoliday ? (
            <span className="text-brand04 text-sm">まだ登録されていません</span>
          ) : longHoliday.start <= today ? (
            <>
              {longHoliday.name}
              <span className="text-brand04 ml-2 text-sm font-medium">
                {longHoliday.truncated ? "(翌年分は未登録)" : `あと${diffDays(today, longHoliday.end) + 1}日`}
              </span>
            </>
          ) : (
            <>
              あと <span className="text-3xl font-black tabular-nums">{diffDays(today, longHoliday.start)}</span> 日
              <span className="text-brand04 mt-1 block text-sm font-medium">
                {longHoliday.name} {shortDate(longHoliday.start)}〜
                {longHoliday.truncated ? "(翌年分は未登録)" : `${shortDate(longHoliday.end)}・${longHoliday.days}日間`}
              </span>
            </>
          )}
        </SummaryCard>
        <SummaryCard label="今月の残りの出勤日(今日を含む)">
          {remaining === null ? (
            <span className="text-brand04 text-sm">まだ登録されていません</span>
          ) : (
            <>
              <span className="text-3xl font-black tabular-nums">{remaining}</span> 日
            </>
          )}
        </SummaryCard>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="calendar-month">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="calendar-month" className="font-heading text-brand01 text-2xl font-black tracking-[0.05em]">
            {current.replace("-", ".")}
          </h2>
          <nav className="flex gap-2" aria-label="月の移動">
            <Link href={href(addMonths(current, -1))} className={NAV_LINK}>
              ‹ 前の月
            </Link>
            {current !== today.slice(0, 7) ? (
              <Link href="/apps/calendar" className={NAV_LINK}>
                今月
              </Link>
            ) : null}
            <Link href={href(addMonths(current, 1))} className={NAV_LINK}>
              次の月 ›
            </Link>
          </nav>
        </div>
        {!hasCompanyYear(year) ? (
          <p className="bg-bg01 text-brand01 p-3 text-sm">
            {year}年の会社カレンダーはまだ登録されていません。メモ・予定は書き込めます。
          </p>
        ) : null}
        <MonthBoard
          key={current}
          weeks={monthGrid(current)}
          entries={entries}
          marks={marks}
          today={today}
          initialDate={today.startsWith(current) ? today : first}
        />
      </section>

      {summary ? (
        <section className="flex flex-col gap-3" aria-labelledby="calendar-year">
          <h2 id="calendar-year" className="text-brand01 text-lg font-bold">
            {year}年のまとめ
          </h2>
          <div className="border-brand01/15 flex flex-col gap-4 border bg-white p-4 md:flex-row md:items-start md:gap-10">
            <dl className="flex gap-8">
              <div>
                <dt className="text-brand04 text-xs font-bold tracking-widest">休日</dt>
                <dd className="text-brand01 font-bold">
                  <span className="text-3xl font-black tabular-nums">{summary.offDays}</span> 日
                </dd>
              </div>
              <div>
                <dt className="text-brand04 text-xs font-bold tracking-widest">出勤日</dt>
                <dd className="text-brand01 font-bold">
                  <span className="text-3xl font-black tabular-nums">{summary.workDays}</span> 日
                </dd>
              </div>
            </dl>
            <div className="md:border-brand01/15 md:border-l md:pl-10">
              <p className="text-brand04 text-xs font-bold tracking-widest">出勤する土曜</p>
              <ul className="text-brand01 mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-bold">
                {summary.workSaturdays.map((d) => (
                  <li key={d}>
                    <Link href={href(d.slice(0, 7))} className="hover:text-brand03 transition-colors">
                      {shortDate(d)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
