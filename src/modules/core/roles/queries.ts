import { asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "../auth/schema";
import { departments } from "../departments/schema";
import { employees } from "../employees/schema";
import { locations } from "../locations/schema";
import { permissions, rolePermissions, roleAssignments, roles } from "./schema";

export type PermissionRow = { id: string; code: string; appKey: string | null; description: string };

export type RoleRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  isProtected: boolean;
  permissionIds: string[];
  assignmentCount: number;
};

export async function listPermissions(): Promise<PermissionRow[]> {
  const rows = await db.select().from(permissions).orderBy(asc(permissions.appKey), asc(permissions.code));
  return rows.map((p) => ({ id: p.id, code: p.code, appKey: p.appKey, description: p.description }));
}

export async function listRoles(): Promise<RoleRow[]> {
  const [roleRows, rpRows, countRows] = await Promise.all([
    db.select().from(roles).orderBy(desc(roles.isSystem), asc(roles.name)),
    db.select().from(rolePermissions),
    db
      .select({ roleId: roleAssignments.roleId, n: count() })
      .from(roleAssignments)
      .groupBy(roleAssignments.roleId),
  ]);
  const permsByRole = new Map<string, string[]>();
  for (const rp of rpRows) {
    const list = permsByRole.get(rp.roleId) ?? [];
    list.push(rp.permissionId);
    permsByRole.set(rp.roleId, list);
  }
  const counts = new Map(countRows.map((c) => [c.roleId, Number(c.n)]));
  return roleRows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    isProtected: r.isProtected,
    permissionIds: permsByRole.get(r.id) ?? [],
    assignmentCount: counts.get(r.id) ?? 0,
  }));
}

export type AssignmentListItem = {
  id: string;
  userId: string;
  loginId: string;
  userStatus: string;
  employeeName: string | null;
  roleId: string;
  roleName: string;
  roleCode: string;
  locationId: string | null;
  locationName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  grantedAt: Date;
};

export async function listAssignments(): Promise<AssignmentListItem[]> {
  const rows = await db
    .select({
      id: roleAssignments.id,
      userId: users.id,
      loginId: users.loginId,
      userStatus: users.status,
      employeeName: employees.name,
      roleId: roles.id,
      roleName: roles.name,
      roleCode: roles.code,
      locationId: roleAssignments.locationId,
      locationName: locations.name,
      departmentId: roleAssignments.departmentId,
      departmentName: departments.name,
      grantedAt: roleAssignments.grantedAt,
    })
    .from(roleAssignments)
    .innerJoin(users, eq(roleAssignments.userId, users.id))
    .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .leftJoin(locations, eq(roleAssignments.locationId, locations.id))
    .leftJoin(departments, eq(roleAssignments.departmentId, departments.id))
    .orderBy(asc(users.loginId), asc(roles.name));
  return rows;
}

export type AssignableUser = { id: string; loginId: string; status: string; employeeName: string | null };

export async function listAssignableUsers(): Promise<AssignableUser[]> {
  return db
    .select({
      id: users.id,
      loginId: users.loginId,
      status: users.status,
      employeeName: employees.name,
    })
    .from(users)
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .orderBy(asc(users.loginId));
}

export type ScopeOptions = {
  locations: { id: string; name: string }[];
  departments: { id: string; name: string }[];
};

export async function listScopeOptions(): Promise<ScopeOptions> {
  const [loc, dep] = await Promise.all([
    db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.isActive, true))
      .orderBy(asc(locations.sortOrder), asc(locations.name)),
    db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.isActive, true))
      .orderBy(asc(departments.sortOrder), asc(departments.name)),
  ]);
  return { locations: loc, departments: dep };
}
