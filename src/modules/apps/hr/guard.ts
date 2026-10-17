import type { Actor } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { manifest } from "./manifest";
import { getEmployeeProfile, modeFor } from "./queries";

// Server Action 用の判定(このファイルは "use server" にしない。クライアントから直接呼ばせないため)。

/** アプリを使えて、かつ対象の社員を管理できるときだけ actor を返す(自分自身は self になるので null)。 */
export async function managerFor(employeeId: string): Promise<Actor | null> {
  const actor = await requireAppAccess(manifest.appKey);
  const profile = await getEmployeeProfile(employeeId, actor.today);
  if (!profile) return null;
  return modeFor(actor, profile) === "manager" ? actor : null;
}

export const DENIED = "この社員の情報を書く権限がありません。";
