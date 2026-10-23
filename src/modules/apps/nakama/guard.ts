import { canGlobally, type Actor } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { manifest } from "./manifest";

export const MANAGE_PERMISSION = "nakama.members.manage";

/** 名簿の登録・編集ができるか(全社の権限)。 */
export function canManage(actor: Actor): boolean {
  return canGlobally(actor, MANAGE_PERMISSION);
}

/** 名簿の管理の画面・Server Action の入口。権限がなければ null。 */
export async function managerOrNull(): Promise<Actor | null> {
  const actor = await requireAppAccess(manifest.appKey);
  return canManage(actor) ? actor : null;
}
