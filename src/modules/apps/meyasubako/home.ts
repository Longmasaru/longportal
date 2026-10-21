import { requireActor } from "@/modules/core/access";
import { canAccessApp } from "@/modules/core/apps";
import type { PendingItem } from "@/modules/core/portal";
import { manifest } from "./manifest";
import { countPending } from "./queries";

/**
 * ホームの「要対応」に出す目安箱の項目(docs/DESIGN.md 42 章)。
 * 返事をする側には未対応の投稿の数、投稿した人には、まだ読んでいない返事の数。
 */
export async function getMeyasubakoPendingItems(): Promise<PendingItem[]> {
  const actor = await requireActor();
  if (actor.mustChangePassword || !(await canAccessApp(actor, manifest.appKey))) return [];
  const { inbox, replies } = await countPending(actor);
  const items: PendingItem[] = [];
  if (inbox > 0) {
    items.push({
      appKey: manifest.appKey,
      appName: manifest.displayName,
      icon: manifest.icon,
      label: `未対応の投稿 ${inbox}件`,
      href: `${manifest.route}?tab=inbox`,
    });
  }
  if (replies > 0) {
    items.push({
      appKey: manifest.appKey,
      appName: manifest.displayName,
      icon: manifest.icon,
      label: `あなたの投稿に返事・お知らせ ${replies}件`,
      href: `${manifest.route}?tab=mine`,
    });
  }
  return items;
}
