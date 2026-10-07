"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { requireGlobalPermission } from "../access";
import { writeAuditLog } from "../audit";
import { users } from "../auth/schema";
import { PG_UNIQUE_VIOLATION, pgErrorCode } from "../shared/db-errors";
import { todayJst } from "../shared/jst";
import { LAST_SYSTEM_ADMIN_MESSAGE, isSoleActiveSystemAdmin } from "./protection";
import { permissions, rolePermissions, roleAssignments, roles } from "./schema";

// ロール・権限・割当の Server Action。すべて core.roles.manage(全社)で本判定し、変更は監査ログと同じ
// トランザクションで記録する。権限(permission)の code はコード側の定義が正で、ここからは作成できない。

export type RoleFormState = { error?: string; success?: string } | undefined;

const uuid = z.uuid("選択内容が正しくありません。");

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力内容を確認してください。";
}

function formObject(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
}

const roleFields = {
  name: z.string().trim().min(1, "ロール名を入力してください。").max(50, "ロール名は50文字以内で入力してください。"),
  description: z.string().trim().max(200, "説明は200文字以内で入力してください。"),
};

const createRoleSchema = z.object({
  ...roleFields,
  code: z
    .string()
    .trim()
    .min(1, "コードを入力してください。")
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "コードは半角小文字で始まり、小文字・数字・_ のみで入力してください。"),
});

export async function createRoleAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requireGlobalPermission("core.roles.manage");
  const parsed = createRoleSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(roles)
        .values({ ...parsed.data, isSystem: false, isProtected: false })
        .returning();
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "role.create",
        targetType: "role",
        targetId: created.id,
        after: { code: created.code, name: created.name, description: created.description },
      });
    });
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) return { error: "このコードは既に使われています。" };
    throw err;
  }

  revalidatePath("/admin/roles");
  return { success: `ロール「${parsed.data.name}」を作成しました。権限を選んで保存してください。` };
}

const updateRoleSchema = z.object({ id: uuid, ...roleFields });

export async function updateRoleAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requireGlobalPermission("core.roles.manage");
  const parsed = updateRoleSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const permissionIds = formData.getAll("permissionIds").filter((v): v is string => typeof v === "string");
  if (!permissionIds.every((p) => uuid.safeParse(p).success)) return { error: "不正なリクエストです。" };
  const { id, name, description } = parsed.data;

  const error = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!before) return "ロールが見つかりません。";
    if (before.isProtected) return "このロールは保護されているため、変更できません。";

    // 存在する権限だけを対象にする(コード側の定義から sync された権限のみ)。
    const valid = permissionIds.length
      ? await tx.select({ id: permissions.id, code: permissions.code }).from(permissions).where(inArray(permissions.id, permissionIds))
      : [];
    const beforeCodes = (
      await tx
        .select({ code: permissions.code })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(rolePermissions.roleId, id))
    ).map((r) => r.code);

    await tx.update(roles).set({ name, description }).where(eq(roles.id, id));
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
    if (valid.length > 0) {
      await tx.insert(rolePermissions).values(valid.map((p) => ({ roleId: id, permissionId: p.id })));
    }
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "role.update",
      targetType: "role",
      targetId: id,
      before: { name: before.name, description: before.description, permissions: beforeCodes.sort() },
      after: { name, description, permissions: valid.map((p) => p.code).sort() },
    });
    return null;
  });
  if (error) return { error };

  revalidatePath("/admin/roles");
  return { success: "保存しました。" };
}

const deleteRoleSchema = z.object({ id: uuid });

export async function deleteRoleAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requireGlobalPermission("core.roles.manage");
  const parsed = deleteRoleSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { id } = parsed.data;

  const error = await db.transaction(async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!role) return "ロールが見つかりません。";
    if (role.isSystem || role.isProtected) return "システムのロールは削除できません。";
    const assigned = await tx
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(eq(roleAssignments.roleId, id))
      .limit(1);
    if (assigned.length > 0) return "割当が残っているため削除できません。先に割当を解除してください。";
    await tx.delete(roles).where(eq(roles.id, id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "role.delete",
      targetType: "role",
      targetId: id,
      before: { code: role.code, name: role.name },
    });
    return null;
  });
  if (error) return { error };

  revalidatePath("/admin/roles");
  return { success: "ロールを削除しました。" };
}

// ---- ロール割当 ----------------------------------------------------------------

const addAssignmentSchema = z.object({
  userId: uuid,
  roleId: uuid,
  locationId: z.string().transform((v) => (v === "" ? null : v)).pipe(uuid.nullable()),
  departmentId: z.string().transform((v) => (v === "" ? null : v)).pipe(uuid.nullable()),
});

export async function addAssignmentAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requireGlobalPermission("core.roles.manage");
  const parsed = addAssignmentSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { userId, roleId, locationId, departmentId } = parsed.data;

  try {
    const error = await db.transaction(async (tx) => {
      const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1);
      if (!role) return "ロールが見つかりません。";
      const [user] = await tx.select({ id: users.id, loginId: users.loginId }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return "ユーザーが見つかりません。";
      if (role.isProtected && (locationId !== null || departmentId !== null)) {
        return "このロールは全社(拠点・部署を指定しない)でのみ割り当てられます。";
      }
      const [created] = await tx
        .insert(roleAssignments)
        .values({ userId, roleId, locationId, departmentId, grantedBy: actor.userId })
        .returning();
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "role_assignment.create",
        targetType: "user",
        targetId: userId,
        after: { loginId: user.loginId, role: role.code, locationId, departmentId, assignmentId: created.id },
      });
      return null;
    });
    if (error) return { error };
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) return { error: "同じ内容の割当が既にあります。" };
    throw err;
  }

  revalidatePath("/admin/roles/assignments");
  revalidatePath("/admin/employees");
  return { success: "ロールを割り当てました。" };
}

const removeAssignmentSchema = z.object({ assignmentId: uuid });

export async function removeAssignmentAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requireGlobalPermission("core.roles.manage");
  const parsed = removeAssignmentSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { assignmentId } = parsed.data;
  const today = todayJst();

  const error = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ assignment: roleAssignments, role: roles, loginId: users.loginId })
      .from(roleAssignments)
      .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
      .innerJoin(users, eq(roleAssignments.userId, users.id))
      .where(eq(roleAssignments.id, assignmentId))
      .limit(1);
    if (!row) return "割当が見つかりません。";

    // アクセスできる最後のシステム管理者の system_admin は剥奪できない。
    if (
      row.role.isProtected &&
      row.assignment.locationId === null &&
      row.assignment.departmentId === null &&
      (await isSoleActiveSystemAdmin(tx, row.assignment.userId, today))
    ) {
      return LAST_SYSTEM_ADMIN_MESSAGE;
    }

    await tx.delete(roleAssignments).where(and(eq(roleAssignments.id, assignmentId)));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "role_assignment.delete",
      targetType: "user",
      targetId: row.assignment.userId,
      before: {
        loginId: row.loginId,
        role: row.role.code,
        locationId: row.assignment.locationId,
        departmentId: row.assignment.departmentId,
      },
    });
    return null;
  });
  if (error) return { error };

  revalidatePath("/admin/roles/assignments");
  revalidatePath("/admin/employees");
  return { success: "割当を解除しました。" };
}
