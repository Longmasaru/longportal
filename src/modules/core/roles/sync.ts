import { asc, eq, inArray, isNull } from "drizzle-orm";
import type { db } from "@/db/client";
import { users } from "../auth/schema";
import {
  SYSTEM_ADMIN_ROLE_CODE,
  SYSTEM_ADMIN_ROLE_NAME,
  type PermissionDefinition,
} from "./catalog";
import { permissions, rolePermissions, roleAssignments, roles } from "./schema";

type Executor = Pick<typeof db, "insert" | "select" | "update" | "delete">;

/** system_admin ロールを用意する(なければ作成。あれば保護フラグを保つ)。ロール id を返す。 */
export async function ensureSystemAdminRole(tx: Executor): Promise<string> {
  const [role] = await tx
    .insert(roles)
    .values({
      code: SYSTEM_ADMIN_ROLE_CODE,
      name: SYSTEM_ADMIN_ROLE_NAME,
      description: "すべての権限を持つ固定のロール。削除・名称変更・権限の変更はできません。",
      isSystem: true,
      isProtected: true,
    })
    .onConflictDoUpdate({
      target: roles.code,
      set: { isSystem: true, isProtected: true },
    })
    .returning({ id: roles.id });
  return role.id;
}

export type SyncReport = {
  added: string[];
  updated: string[];
  /** コード側の定義にない権限(DB に残っているもの)。 */
  stale: string[];
  pruned: boolean;
  /** system_admin に新たに付与した権限の数。 */
  grantedToSystemAdmin: number;
};

/**
 * 権限の定義(コード)を DB に反映する。
 * - 新しい権限は追加し、説明などが変わったものは更新する。
 * - コードにない権限は、既定では残して警告する(prune = true のときだけ削除。role_permissions も消える)。
 * - system_admin には、常に全権限を持たせる(新しい権限は自動付与。他のロールには付与しない)。
 * - 管理画面で編集したロールと権限の対応(role_permissions)は上書きしない。
 */
export async function syncPermissions(
  tx: Executor,
  definitions: PermissionDefinition[],
  options: { prune?: boolean } = {},
): Promise<SyncReport> {
  const systemAdminId = await ensureSystemAdminRole(tx);
  const existing = await tx.select().from(permissions);
  const byCode = new Map(existing.map((p) => [p.code, p]));

  const added: string[] = [];
  const updated: string[] = [];
  for (const def of definitions) {
    const appKey = def.appKey ?? null;
    const current = byCode.get(def.code);
    if (!current) {
      await tx.insert(permissions).values({ code: def.code, appKey, description: def.description });
      added.push(def.code);
    } else if (current.description !== def.description || current.appKey !== appKey) {
      await tx
        .update(permissions)
        .set({ description: def.description, appKey })
        .where(eq(permissions.code, def.code));
      updated.push(def.code);
    }
  }

  const definedCodes = definitions.map((d) => d.code);
  const stale = existing.map((p) => p.code).filter((c) => !definedCodes.includes(c));
  if (options.prune && stale.length > 0) {
    await tx.delete(permissions).where(inArray(permissions.code, stale));
  }

  // system_admin に全権限を付与(すでにあるものは何もしない)
  const all = await tx
    .select({ id: permissions.id })
    .from(permissions)
    .where(definedCodes.length ? inArray(permissions.code, definedCodes) : undefined);
  const owned = await tx
    .select({ permissionId: rolePermissions.permissionId })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, systemAdminId));
  const ownedIds = new Set(owned.map((o) => o.permissionId));
  const missing = all.filter((p) => !ownedIds.has(p.id));
  if (missing.length > 0) {
    await tx
      .insert(rolePermissions)
      .values(missing.map((p) => ({ roleId: systemAdminId, permissionId: p.id })))
      .onConflictDoNothing();
  }

  return {
    added,
    updated,
    stale,
    pruned: Boolean(options.prune) && stale.length > 0,
    grantedToSystemAdmin: missing.length,
  };
}

/**
 * system_admin を持つユーザーが 1 人もいない場合の初期設定(seed 用)。
 * 最も古い「社員に紐づかないアカウント」に、全社の system_admin を付与する。付与した login_id を返す。
 */
export async function bootstrapSystemAdmin(tx: Executor): Promise<string | null> {
  const systemAdminId = await ensureSystemAdminRole(tx);
  const holders = await tx
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(eq(roleAssignments.roleId, systemAdminId))
    .limit(1);
  if (holders.length > 0) return null;

  const [candidate] = await tx
    .select({ id: users.id, loginId: users.loginId })
    .from(users)
    .where(isNull(users.employeeId))
    .orderBy(asc(users.createdAt))
    .limit(1);
  if (!candidate) return null;

  await tx.insert(roleAssignments).values({
    userId: candidate.id,
    roleId: systemAdminId,
    locationId: null,
    departmentId: null,
  });
  return candidate.loginId;
}

/** 管理者を復旧するための付与(login_id 指定)。社員に紐づくアカウントにも付与できる。 */
export async function grantSystemAdmin(tx: Executor, loginId: string): Promise<boolean> {
  const systemAdminId = await ensureSystemAdminRole(tx);
  const [user] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.loginId, loginId.trim().toLowerCase()))
    .limit(1);
  if (!user) return false;
  await tx
    .insert(roleAssignments)
    .values({ userId: user.id, roleId: systemAdminId, locationId: null, departmentId: null })
    .onConflictDoNothing();
  return true;
}

