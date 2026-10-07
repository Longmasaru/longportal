import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/db/client";
import { auth } from "../auth/auth";
import { users } from "../auth/schema";
import { departments } from "../departments/schema";
import { employeeAssignments, employees } from "../employees/schema";
import { locations } from "../locations/schema";
import { positions } from "../positions/schema";
import { permissions, rolePermissions, roleAssignments, roles } from "../roles/schema";
import { todayJst } from "../shared/jst";
import { evaluateUserAccess, type AccessDenyReason } from "./evaluate";
import type { Grant } from "./grants";

export type ActorAssignment = {
  id: string;
  departmentId: string;
  departmentName: string;
  locationId: string;
  locationName: string;
  isPrimary: boolean;
  startDate: string;
  endDate: string | null;
};

/** ユーザーに付与されたロール(割当 1 件)。表示用。 */
export type ActorRole = {
  code: string;
  name: string;
  locationId: string | null;
  departmentId: string | null;
};

/** アクセス判定を通過した、ログイン中の利用者。 */
export type Actor = {
  userId: string;
  loginId: string;
  mustChangePassword: boolean;
  /** 社員以外の user は null。 */
  employee: {
    id: string;
    employeeNumber: string;
    name: string;
    positionName: string | null;
  } | null;
  /** 判定時点(today)に有効な所属。主所属が先頭。 */
  assignments: ActorAssignment[];
  /** 付与されているロール(スコープ付きの割当ごと)。 */
  roles: ActorRole[];
  /** ロールの権限 × 割当のスコープ。権限の判定(can / requirePermission)に使う。 */
  grants: Grant[];
  /** 判定に使った基準日(JST)。 */
  today: string;
};

export type ActorDenyReason = AccessDenyReason | "no_session" | "user_not_found";
export type ActorResult = { ok: true; actor: Actor } | { ok: false; reason: ActorDenyReason };

const uuidSchema = z.uuid();

/**
 * userId から Actor を組み立てる(セッションに依存しない部分。テストしやすいよう分離)。
 * docs/DESIGN.md 5.2 の評価順の 2〜7。権限・Audience の評価(8)は後続の手順で追加する。
 */
export async function loadActor(userId: string, today: string): Promise<ActorResult> {
  if (!uuidSchema.safeParse(userId).success) return { ok: false, reason: "user_not_found" };

  const [row] = await db
    .select({ user: users, employee: employees, positionName: positions.name })
    .from(users)
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return { ok: false, reason: "user_not_found" };

  // 2〜6: users.status、employees.status、hired_on、left_on(毎回 DB の値で判定する)
  const denied = evaluateUserAccess(row.user, row.employee, today);
  if (denied) return { ok: false, reason: denied };

  // 7: 基準日に有効な所属(0 件でも deny にはしない)
  const assignments: ActorAssignment[] = row.employee
    ? await db
        .select({
          id: employeeAssignments.id,
          departmentId: employeeAssignments.departmentId,
          departmentName: departments.name,
          locationId: employeeAssignments.locationId,
          locationName: locations.name,
          isPrimary: employeeAssignments.isPrimary,
          startDate: employeeAssignments.startDate,
          endDate: employeeAssignments.endDate,
        })
        .from(employeeAssignments)
        .innerJoin(departments, eq(employeeAssignments.departmentId, departments.id))
        .innerJoin(locations, eq(employeeAssignments.locationId, locations.id))
        .where(
          and(
            eq(employeeAssignments.employeeId, row.employee.id),
            lte(employeeAssignments.startDate, today),
            or(isNull(employeeAssignments.endDate), gte(employeeAssignments.endDate, today)),
          ),
        )
        .orderBy(desc(employeeAssignments.isPrimary), employeeAssignments.startDate)
    : [];

  // 8: ロールと権限(スコープ付き)。権限・在籍状態は JWT ではなく、毎回ここで DB から読む。
  const roleRows = await db
    .select({
      code: roles.code,
      name: roles.name,
      locationId: roleAssignments.locationId,
      departmentId: roleAssignments.departmentId,
    })
    .from(roleAssignments)
    .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
    .where(eq(roleAssignments.userId, row.user.id));
  const grantRows = await db
    .select({
      permissionCode: permissions.code,
      locationId: roleAssignments.locationId,
      departmentId: roleAssignments.departmentId,
    })
    .from(roleAssignments)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roleAssignments.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(roleAssignments.userId, row.user.id));

  return {
    ok: true,
    actor: {
      userId: row.user.id,
      loginId: row.user.loginId,
      mustChangePassword: row.user.mustChangePassword,
      employee: row.employee
        ? {
            id: row.employee.id,
            employeeNumber: row.employee.employeeNumber,
            name: row.employee.name,
            positionName: row.positionName,
          }
        : null,
      assignments,
      roles: roleRows,
      grants: grantRows,
      today,
    },
  };
}

/**
 * 現在のリクエストの利用者を解決する(docs/DESIGN.md 5.2)。
 * 1. セッション確認(JWT は userId のみ。権限・在籍状態は JWT で判断しない)
 * 2〜7. loadActor(毎回 DB を参照)
 * 結果はリクエスト内でメモ化する(永続キャッシュは使わない)。
 */
export const resolveActor = cache(async (): Promise<ActorResult> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, reason: "no_session" };
  return loadActor(userId, todayJst());
});

/**
 * ログイン済みで、かつアクセスが許可されている利用者を返す。
 * 未ログインは /login へ、アクセス不可(無効・退職・入社前など)は理由付きで /login へ送る。
 * page / layout / Server Action / Route Handler など、本判定が必要な箇所はすべてこれを通す。
 */
export async function requireActor(): Promise<Actor> {
  const result = await resolveActor();
  if (result.ok) return result.actor;
  if (result.reason === "no_session") redirect("/login");
  redirect(`/login?reason=${result.reason}`);
}
