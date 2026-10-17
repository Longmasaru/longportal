import Link from "next/link";
import { resolveActor } from "@/modules/core/access";
import { canAccessApp } from "@/modules/core/apps";
import { todayJst } from "@/modules/core/shared/jst";
import { todaysHighlights } from "../highlights";
import { manifest } from "../manifest";
import { getHiredOn } from "../queries";
import { HighlightList } from "./highlight-list";

/**
 * ホームの一番上に出す、会社カレンダーからのお知らせ(出勤土曜・明日から連休・入社の周年・給料日)。docs/DESIGN.md 33 章。
 * カレンダーを使えない人や、知らせることがない日は何も描画しない。
 */
export async function CalendarHomeNotice() {
  const result = await resolveActor();
  if (!result.ok || result.actor.mustChangePassword) return null;
  const actor = result.actor;
  if (!(await canAccessApp(actor, manifest.appKey))) return null;

  const items = todaysHighlights(todayJst(), { hiredOn: await getHiredOn(actor.employee?.id) });
  if (items.length === 0) return null;

  return (
    <section aria-label="会社カレンダーからのお知らせ" className="mx-auto -mb-4 w-full max-w-6xl px-4 pt-8 md:-mb-6 md:px-8 md:pt-10">
      <HighlightList items={items} />
      <p className="mt-2 text-right">
        <Link href={manifest.route} className="text-brand04 hover:text-brand03 text-xs font-bold transition-colors">
          会社カレンダーを開く ›
        </Link>
      </p>
    </section>
  );
}
