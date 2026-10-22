import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "../auth/schema";
import { employees } from "../employees/schema";
import { permissions, rolePermissions, roleAssignments } from "../roles/schema";
import { evaluateUserAccess } from "./evaluate";
import { grantAllows, type Grant, type ScopeTarget } from "./grants";

/** 権限を持つ人(知らせを届ける相手の割り出し用)。 */
export type PermissionHolder = { userId: string; employeeId: string | null };

/**
 * その権限を、対象データに対して使える人の一覧(今日の時点で利用できるアカウントだけ)。
 * 判定は can() と同じ grantAllows。アプリが「返事ができる人に知らせる」ときに使う。
 */
export async function listPermissionHolders(code: string, target: ScopeTarget, today: string): Promise<PermissionHolder[]> {
  const rows = await db
    .select({
      userId: roleAssignments.userId,
      locationId: roleAssignments.locationId,
      departmentId: roleAssignments.departmentId,
    })
    .from(roleAssignments)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roleAssignments.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(permissions.code, code));

  const grantsByUser = new Map<string, Grant[]>();
  for (const r of rows) {
    const list = grantsByUser.get(r.userId) ?? [];
    list.push({ permissionCode: code, locationId: r.locationId, departmentId: r.departmentId });
    grantsByUser.set(r.userId, list);
  }
  const userIds = [...grantsByUser].filter(([, grants]) => grantAllows(grants, code, target)).map(([id]) => id);
  if (userIds.length === 0) return [];

  const people = await db
    .select({ user: users, employee: employees })
    .from(users)
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .where(inArray(users.id, userIds));
  return people
    .filter((p) => evaluateUserAccess(p.user, p.employee, today) === null)
    .map((p) => ({ userId: p.user.id, employeeId: p.employee?.id ?? null }));
}
