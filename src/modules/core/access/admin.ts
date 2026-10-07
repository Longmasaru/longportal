import { notFound } from "next/navigation";
import { requireActor, type Actor } from "./actor";

/**
 * 管理者かどうか。★暫定★ roles / role_assignments / permissions を実装する手順4までの仮規則で、
 * 「社員に紐づかないアカウント(employee_id が NULL)= システム管理者」とする。
 * 社員に発行したアカウントは管理者にならない。手順4で system_admin ロールの判定に置き換える。
 */
export function isAdminActor(actor: Actor): boolean {
  return actor.employee === null;
}

/**
 * 管理画面・管理系 Server Action の入口の本判定。管理者以外は 404 にする(管理画面の存在を知らせない)。
 * page / layout だけでなく、Server Action でも必ず呼ぶこと。
 */
export async function requireAdmin(): Promise<Actor> {
  const actor = await requireActor();
  if (!isAdminActor(actor)) notFound();
  return actor;
}
