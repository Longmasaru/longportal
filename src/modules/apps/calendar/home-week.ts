import { resolveActor } from "@/modules/core/access";
import { canAccessApp } from "@/modules/core/apps";
import type { HomeWeek } from "@/modules/core/portal";
import { dayInfo, weekDates } from "./logic";
import { manifest } from "./manifest";
import { listEntries } from "./queries";

/**
 * ホームの「今週の予定」のデータ(会社の休み・祝日 + 本人のメモ・予定)。
 * カレンダーを使えない人(アプリ管理で無効・対象外)や、初回のパスワード変更前の人には null。
 */
export async function getHomeWeek(): Promise<HomeWeek | null> {
  const result = await resolveActor();
  if (!result.ok || result.actor.mustChangePassword) return null;
  const actor = result.actor;
  if (!(await canAccessApp(actor, manifest.appKey))) return null;

  const dates = weekDates(actor.today);
  const entries = await listEntries(actor.userId, dates[0], dates[6]);
  return {
    href: manifest.route,
    days: dates.map((date) => {
      const info = dayInfo(date);
      return {
        date,
        weekday: info.weekday,
        isToday: date === actor.today,
        isOff: info.kind === "off",
        isWorkSaturday: info.isWorkSaturday,
        label: info.label,
        entries: entries.filter((e) => e.date === date).map((e) => ({ time: e.time, title: e.title })),
        href: `${manifest.route}?month=${date.slice(0, 7)}`,
      };
    }),
  };
}
