import { requireActor } from "@/modules/core/access";
import { canAccessApp } from "@/modules/core/apps";
import type { PendingItem } from "@/modules/core/portal";
import { manifest } from "./manifest";
import { countPending } from "./queries";

/**
 * ホームの「要対応」に出すカイゼン図鑑の項目(docs/DESIGN.md 44 章)。
 * 鑑定する人には鑑定待ちの数、登録した人には、まだ開いていない鑑定の結果の数。
 */
export async function getZukanPendingItems(): Promise<PendingItem[]> {
  const actor = await requireActor();
  if (actor.mustChangePassword || !(await canAccessApp(actor, manifest.appKey))) return [];
  const { queue, reveals } = await countPending(actor);
  const items: PendingItem[] = [];
  if (queue > 0) {
    items.push({
      appKey: manifest.appKey,
      appName: manifest.displayName,
      icon: manifest.icon,
      label: `鑑定待ち ${queue}件`,
      href: `${manifest.route}?view=appraise`,
    });
  }
  if (reveals > 0) {
    items.push({
      appKey: manifest.appKey,
      appName: manifest.displayName,
      icon: manifest.icon,
      label: `鑑定の結果が届きました ${reveals}件`,
      href: `${manifest.route}?view=mine`,
    });
  }
  return items;
}
