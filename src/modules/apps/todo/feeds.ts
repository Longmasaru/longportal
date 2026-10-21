import { resolveActor } from "@/modules/core/access";
import { canAccessApp } from "@/modules/core/apps";
import { dueDayItems, type TodoCalendarItem } from "./calendar-items";
import { manifest } from "./manifest";
import { listDueSources } from "./queries";

/**
 * 本人の会社カレンダーに出す「TODO の期限」(docs/DESIGN.md 41.4)。本人の TODO と、頼まれた依頼だけ。
 * src/app のカレンダーのルートが読み、ただのデータとしてカレンダーに渡す(アプリどうしは参照しない)。
 * TODO アプリを使えない人には空の一覧を返す。
 */
export async function listTodoCalendarItems(): Promise<TodoCalendarItem[]> {
  const result = await resolveActor();
  if (!result.ok || result.actor.mustChangePassword) return [];
  if (!(await canAccessApp(result.actor, manifest.appKey))) return [];
  return dueDayItems(await listDueSources(result.actor.userId), manifest.route);
}
