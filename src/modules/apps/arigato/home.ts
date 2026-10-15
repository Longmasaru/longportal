import { requireActor } from "@/modules/core/access";
import { canAccessApp } from "@/modules/core/apps";
import type { PendingItem } from "@/modules/core/portal";
import { manifest } from "./manifest";
import { getWeekStatus } from "./queries";

/**
 * ホームの「要対応」に出す「今週の一枚」(docs/DESIGN.md 26 章)。
 * アプリを使えて、今週(月曜はじまり・JST)まだ 1 枚も送っていない人にだけ返す。
 */
export async function getArigatoPendingItems(): Promise<PendingItem[]> {
  const actor = await requireActor();
  if (actor.mustChangePassword || !(await canAccessApp(actor, manifest.appKey))) return [];
  const week = await getWeekStatus(actor.userId, actor.today);
  if (week.sentThisWeek) return [];
  return [
    {
      appKey: manifest.appKey,
      appName: manifest.displayName,
      icon: manifest.icon,
      label: "今週の一枚を送りませんか",
      href: manifest.route,
    },
  ];
}
