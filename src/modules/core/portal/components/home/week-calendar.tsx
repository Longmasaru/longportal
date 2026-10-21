import Link from "next/link";
import type { HomeWeek } from "../../types";
import { SectionHeading } from "../section-heading";

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"] as const;
const MAX_ENTRIES = 3;

/**
 * ホームの「今週」(月曜〜日曜)。会社の休み・祝日と、本人のメモ・予定を 1 週間分ならべる。
 * データは会社カレンダーのアプリが作る(core はアプリを参照しないため、src/app のホームから渡される)。
 * スマホは日ごとの縦の一覧、広い画面は 7 列の表。
 */
export function WeekCalendar({ week }: { week: HomeWeek }) {
  return (
    <section aria-labelledby="home-week-heading">
      <SectionHeading
        id="home-week-heading"
        en="THIS WEEK"
        ja="今週の予定"
        aside={
          <Link href={week.href} className="text-brand01 hover:text-brand03 font-bold transition-colors">
            カレンダーを開く
          </Link>
        }
      />
      <ol className="border-brand04/40 mt-4 border-t md:grid md:grid-cols-7 md:border-l">
        {week.days.map((day) => {
          const off = day.isOff;
          const dayColor = day.weekday === 0 || off ? "text-brand03" : day.weekday === 6 ? "text-link" : "text-brand01";
          const shown = day.entries.slice(0, MAX_ENTRIES);
          const more = day.entries.length - shown.length;
          return (
            <li
              key={day.date}
              className={`border-brand04/40 border-b md:border-r ${off ? "bg-brand03/5" : "bg-white"} ${
                day.isToday ? "outline-brand01 relative z-10 outline-2 -outline-offset-2" : ""
              }`}
            >
              <Link
                href={day.href}
                aria-current={day.isToday ? "date" : undefined}
                className="hover:bg-bg01 flex min-h-full gap-3 px-3 py-2.5 transition-colors md:min-h-28 md:flex-col md:gap-1.5"
              >
                <p className={`flex w-16 shrink-0 flex-wrap items-baseline gap-x-1 gap-y-0.5 md:w-auto ${dayColor}`}>
                  <span className="font-heading text-lg leading-none font-black tabular-nums">
                    {Number(day.date.slice(8, 10))}
                  </span>
                  <span className="text-xs font-bold">({WEEKDAY[day.weekday]})</span>
                  {day.isToday ? <span className="bg-brand01 px-1 text-[0.625rem] leading-4 font-bold whitespace-nowrap text-white">今日</span> : null}
                </p>
                <div className="min-w-0 flex-1 text-xs leading-relaxed">
                  {off || day.label || day.isWorkSaturday ? (
                    <p className={`font-bold ${off ? "text-brand03" : "text-brand01"}`}>
                      {day.isWorkSaturday ? "出勤日" : off ? (day.label ?? "休み") : day.label}
                    </p>
                  ) : null}
                  {shown.map((e, i) => (
                    <p key={i} className="text-brand01 truncate" title={e.time ? `${e.time} ${e.title}` : e.title}>
                      {e.time ? <span className="text-brand04 mr-1 tabular-nums">{e.time}</span> : null}
                      {e.title}
                    </p>
                  ))}
                  {more > 0 ? <p className="text-brand04">ほか {more} 件</p> : null}
                  {!off && !day.label && !day.isWorkSaturday && shown.length === 0 ? (
                    <p className="text-brand04/70 md:hidden">予定なし</p>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="text-brand04 mt-2 text-xs">
        予定は、本人だけに見えるカレンダーのメモです。日付を押すと、その月のカレンダーが開きます。
      </p>
    </section>
  );
}
