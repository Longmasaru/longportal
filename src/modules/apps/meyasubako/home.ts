import { requireActor, resolveActor } from "@/modules/core/access";
import { canAccessApp } from "@/modules/core/apps";
import type { PendingItem } from "@/modules/core/portal";
import { manifest } from "./manifest";
import { countInboxPending, countPending, isResponder } from "./queries";

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

/**
 * サイドバーの「目安箱」の横に出す数(返事をする側の未対応の件数。docs/DESIGN.md 42 章)。
 * すべての画面のレイアウトで呼ばれるので、返事をしない人には DB を読まない。数えられなくても画面は止めない。
 */
export async function getMeyasubakoNavBadge(): Promise<number> {
  try {
    const r = await resolveActor();
    if (!r.ok || r.actor.mustChangePassword || !isResponder(r.actor)) return 0;
    if (!(await canAccessApp(r.actor, manifest.appKey))) return 0;
    return await countInboxPending(r.actor);
  } catch (e) {
    console.error("目安箱: 未対応の件数を数えられませんでした", e);
    return 0;
  }
}
