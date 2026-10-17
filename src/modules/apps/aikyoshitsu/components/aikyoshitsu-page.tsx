import { canInAnyScope } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { MANAGE_PERMISSION, manifest } from "../manifest";
import { listSessionsWithMaterials } from "../queries";
import { Classroom } from "./classroom";

/**
 * AI教室。社内AI講習会の資料を、回ごとに開いて全画面で映す。アプリ管理で有効にし、
 * 表示する相手に当てはまる社員だけが見られる(それ以外は 404)。資料の管理は aikyoshitsu.materials.manage を持つ人だけ。
 */
export async function AiKyoshitsuPage() {
  const actor = await requireAppAccess(manifest.appKey);
  const sessions = await listSessionsWithMaterials();
  return <Classroom sessions={sessions} canManage={canInAnyScope(actor, MANAGE_PERMISSION)} />;
}
