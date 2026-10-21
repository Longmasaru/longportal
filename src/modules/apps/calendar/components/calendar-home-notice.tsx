import Link from "next/link";
import { canGlobally, resolveActor } from "@/modules/core/access";
import { canAccessApp } from "@/modules/core/apps";
import { todayJst } from "@/modules/core/shared/jst";
import { COMPANY_CALENDAR } from "../company-calendar";
import { listOffDayEvents, listPendingInvitations } from "../event-queries";
import { withCompanyOffDays } from "../events";
import { todaysHighlights } from "../highlights";
import { CALENDAR_BIRTHDAYS_VIEW, manifest } from "../manifest";
import { getPersonalDates, listBirthdays } from "../queries";
import { HighlightList } from "./highlight-list";
import { InvitationPrompts } from "./invitation-prompts";

/**
 * ホームの一番上に出す、会社カレンダーからのお知らせ(出勤土曜・明日から連休・入社の周年・誕生日・給料日)と、
 * 参加の返事のお願い。docs/DESIGN.md 33 章・37 章・38 章。カレンダーを使えない人や、知らせることがない日は何も描画しない。
 */
export async function CalendarHomeNotice() {
  const result = await resolveActor();
  if (!result.ok || result.actor.mustChangePassword) return null;
  const actor = result.actor;
  if (!(await canAccessApp(actor, manifest.appKey))) return null;

  const today = todayJst();
  const [mine, everyone, offDays, pending] = await Promise.all([
    getPersonalDates(actor.employee?.id),
    canGlobally(actor, CALENDAR_BIRTHDAYS_VIEW) ? listBirthdays(today) : Promise.resolve(null),
    listOffDayEvents(today),
    listPendingInvitations(actor),
  ]);
  const items = todaysHighlights(today, {
    ...mine,
    others: everyone?.filter((p) => p.employeeId !== actor.employee?.id),
    // 全社の休み(一斉有給取得日・臨時休業)を重ねて、連休・出勤土曜を判定する(38.1)
    calendar: withCompanyOffDays(COMPANY_CALENDAR, offDays),
  });
  if (items.length === 0 && pending.length === 0) return null;

  return (
    <section
      aria-label="会社カレンダーからのお知らせ"
      className="mx-auto -mb-4 flex w-full max-w-6xl flex-col gap-2 px-4 pt-8 md:-mb-6 md:px-8 md:pt-10"
    >
      <InvitationPrompts items={pending} />
      <HighlightList items={items} />
      <p className="text-right">
        <Link href={manifest.route} className="text-brand04 hover:text-brand03 text-xs font-bold transition-colors">
          会社カレンダーを開く ›
        </Link>
      </p>
    </section>
  );
}
