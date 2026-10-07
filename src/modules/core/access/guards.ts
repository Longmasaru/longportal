import { notFound } from "next/navigation";
import { requireActor, type Actor } from "./actor";
import { grantAllows, hasAnyGrant, hasGlobalGrant, type ScopeTarget } from "./grants";

// 権限の本判定(docs/DESIGN.md 5・6 章)。page / layout / Server Action / Route Handler など、
// 管理画面や業務データに触れるすべての箇所で、これらを通すこと。deny by default。

/** 対象データに対して、その権限が使えるか(スコープ込み)。 */
export function can(actor: Actor, code: string, target: ScopeTarget): boolean {
  return grantAllows(actor.grants, code, target);
}

/** 全社(スコープなし)でその権限を持つか。core の管理画面はこれを要求する。 */
export function canGlobally(actor: Actor, code: string): boolean {
  return hasGlobalGrant(actor.grants, code);
}

/** どのスコープでもよいので、その権限を持つか(機能の入口を見せるかどうかの判定用)。 */
export function canInAnyScope(actor: Actor, code: string): boolean {
  return hasAnyGrant(actor.grants, code);
}

/**
 * 管理画面・管理系 Server Action の入口。全社の権限が必要。
 * 権限がなければ 404 にする(管理画面の存在を知らせない)。
 */
export async function requireGlobalPermission(code: string): Promise<Actor> {
  const actor = await requireActor();
  if (!canGlobally(actor, code)) notFound();
  return actor;
}

/** スコープのあるデータの操作用。対象データの所属(location / department)を渡して判定する。 */
export async function requirePermission(code: string, target: ScopeTarget): Promise<Actor> {
  const actor = await requireActor();
  if (!can(actor, code, target)) notFound();
  return actor;
}
