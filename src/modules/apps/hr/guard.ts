import type { Actor } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import type { PageMode } from "./logic";
import { manifest } from "./manifest";
import { getEmployeeProfile, modeFor } from "./queries";

// Server Action 用の判定(このファイルは "use server" にしない。クライアントから直接呼ばせないため)。

/** アプリを使えて、かつ対象の社員を管理できるときだけ actor を返す(自分自身は self になるので null)。 */
export async function managerFor(employeeId: string): Promise<Actor | null> {
  const writer = await recordWriterFor(employeeId);
  return writer?.mode === "manager" ? writer.actor : null;
}

/** 対象の社員の記録を書ける(管理する人か上司。31.4)ときだけ、actor と見え方を返す。 */
export async function recordWriterFor(
  employeeId: string,
): Promise<{ actor: Actor; mode: Extract<PageMode, "manager" | "supervisor"> } | null> {
  const actor = await requireAppAccess(manifest.appKey);
  const profile = await getEmployeeProfile(employeeId, actor.today);
  if (!profile) return null;
  const mode = await modeFor(actor, profile);
  return mode === "manager" || mode === "supervisor" ? { actor, mode } : null;
}

export const DENIED = "この社員の情報を書く権限がありません。";
