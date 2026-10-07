import { and, eq, isNull } from "drizzle-orm";
import type { db } from "@/db/client";
import { evaluateUserAccess } from "../access/evaluate";
import { users } from "../auth/schema";
import { employees } from "../employees/schema";
import { SYSTEM_ADMIN_ROLE_CODE } from "./catalog";
import { roleAssignments, roles } from "./schema";

type Executor = Pick<typeof db, "select">;

/**
 * いま実際にアクセスできる system_admin(全社)の保持者の user id。
 * 無効なアカウント・退職済み・入社前などで、アクセス判定に通らないユーザーは数えない。
 */
export async function activeSystemAdminIds(tx: Executor, today: string): Promise<string[]> {
  const rows = await tx
    .select({ user: users, employee: employees })
    .from(roleAssignments)
    .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
    .innerJoin(users, eq(roleAssignments.userId, users.id))
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .where(
      and(
        eq(roles.code, SYSTEM_ADMIN_ROLE_CODE),
        isNull(roleAssignments.locationId),
        isNull(roleAssignments.departmentId),
      ),
    );
  const ids = new Set<string>();
  for (const r of rows) {
    if (evaluateUserAccess(r.user, r.employee, today) === null) ids.add(r.user.id);
  }
  return [...ids];
}

/** そのユーザーが「アクセスできる最後の 1 人の system_admin」か。該当すれば、無効化・剥奪・退職扱いは拒否する。 */
export async function isSoleActiveSystemAdmin(
  tx: Executor,
  userId: string,
  today: string,
): Promise<boolean> {
  const ids = await activeSystemAdminIds(tx, today);
  return ids.length === 1 && ids[0] === userId;
}

export const LAST_SYSTEM_ADMIN_MESSAGE =
  "アクセスできるシステム管理者がいなくなるため、この操作はできません。先に別のシステム管理者を設定してください。";
