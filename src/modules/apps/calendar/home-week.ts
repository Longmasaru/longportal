import { resolveActor } from "@/modules/core/access";
import { canAccessApp } from "@/modules/core/apps";
import type { HomeWeek } from "@/modules/core/portal";
import { COMPANY_CALENDAR } from "./company-calendar";
import { listEventsForViewer, listOffDayEvents } from "./event-queries";
import { isOffKind, withCompanyOffDays } from "./events";
import { dayInfo, weekDates } from "./logic";
import { manifest } from "./manifest";
import { listEntries } from "./queries";

/**
 * ホームの「今週の予定」のデータ(会社の休み・祝日・全社の予定 + 本人のメモ・予定)。
 * 休みの判定は、カレンダーの画面と同じく、紙の会社カレンダーに全社の休み(一斉有給取得日・臨時休業)を重ねて行う。
 * カレンダーを使えない人(アプリ管理で無効・対象外)や、初回のパスワード変更前の人には null。
 */
export async function getHomeWeek(): Promise<HomeWeek | null> {
  const result = await resolveActor();
  if (!result.ok || result.actor.mustChangePassword) return null;
  const actor = result.actor;
  if (!(await canAccessApp(actor, manifest.appKey))) return null;

  const dates = weekDates(actor.today);
  const [entries, events, offDays] = await Promise.all([
    listEntries(actor.userId, dates[0], dates[6]),
    listEventsForViewer(actor, dates[0], dates[6]),
    listOffDayEvents(actor.today),
  ]);
  const calendar = withCompanyOffDays(COMPANY_CALENDAR, offDays);
  return {
    href: manifest.route,
    days: dates.map((date) => {
      const info = dayInfo(date, calendar);
      // 全社の予定(行事など)を先に、本人のメモ・予定をあとに並べる。休みの予定は、休みの表示(label)に出る。
      const companyItems = events
        .filter((e) => e.date === date && !isOffKind(e.kind))
        .map((e) => ({ time: e.time, title: e.title }));
      const myItems = entries.filter((e) => e.date === date).map((e) => ({ time: e.time, title: e.title }));
      return {
        date,
        weekday: info.weekday,
        isToday: date === actor.today,
        isOff: info.kind === "off",
        isWorkSaturday: info.isWorkSaturday,
        label: info.label,
        entries: [...companyItems, ...myItems],
        href: `${manifest.route}?month=${date.slice(0, 7)}`,
      };
    }),
  };
}
