import { canInAnyScope, requireActor } from "@/modules/core/access";
import { canAccessApp } from "@/modules/core/apps";
import type { PendingItem } from "@/modules/core/portal";
import { weekdayJst } from "@/modules/core/shared/jst";
import { shouldRemindToday } from "./logic";
import { manifest, NIPPO_REPORTS_REVIEW } from "./manifest";
import { countAwaitingComment, getOwnStatus } from "./queries";

/**
 * ホームの「要対応」(docs/DESIGN.md 37 章)。
 * 日報を書く人には「今日の日報」、指導者には「コメント待ちの日報」を出す。
 */
export async function getNippoPendingItems(): Promise<PendingItem[]> {
  const actor = await requireActor();
  if (actor.mustChangePassword || !(await canAccessApp(actor, manifest.appKey))) return [];
  const base = { appKey: manifest.appKey, appName: manifest.displayName, icon: manifest.icon } as const;
  const items: PendingItem[] = [];

  if (actor.employee) {
    const own = await getOwnStatus(actor.employee.id, actor.today);
    if (shouldRemindToday(weekdayJst(), own.hasAny, own.todayStatus)) {
      items.push({
        ...base,
        label: own.todayStatus === "draft" ? "今日の日報が下書きのままです" : "今日の日報を書きましょう",
        href: `${manifest.route}/write`,
      });
    }
  }

  if (canInAnyScope(actor, NIPPO_REPORTS_REVIEW)) {
    const n = await countAwaitingComment(actor);
    if (n > 0) items.push({ ...base, label: `コメント待ちの日報 ${n}件`, href: `${manifest.route}?view=pending` });
  }
  return items;
}
