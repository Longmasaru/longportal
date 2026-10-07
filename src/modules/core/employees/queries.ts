import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "../auth/schema";
import { departments } from "../departments/schema";
import { employmentTypes } from "../employment-types/schema";
import { locations } from "../locations/schema";
import { positions } from "../positions/schema";
import { employeeAssignments, employees } from "./schema";
import { employeeWarnings, hasOpenPrimaryAssignment, type EmployeeWarning } from "./logic";

export type AssignmentRow = {
  id: string;
  departmentId: string;
  departmentName: string;
  locationId: string;
  locationName: string;
  isPrimary: boolean;
  startDate: string;
  endDate: string | null;
};

export type EmployeeListItem = {
  id: string;
  employeeNumber: string;
  name: string;
  nameKana: string | null;
  status: string;
  hiredOn: string;
  leftOn: string | null;
  positionName: string | null;
  employmentTypeName: string;
  /** 今日時点で有効な主所属。 */
  current: AssignmentRow | null;
  /** 今日より後に始まる主所属のうち最も早いもの。 */
  upcoming: AssignmentRow | null;
  user: { id: string; loginId: string; status: string } | null;
  warnings: EmployeeWarning[];
};

export type EmployeeFilter = { q?: string; status?: string; warningOnly?: boolean };

const assignmentSelect = {
  id: employeeAssignments.id,
  employeeId: employeeAssignments.employeeId,
  departmentId: employeeAssignments.departmentId,
  departmentName: departments.name,
  locationId: employeeAssignments.locationId,
  locationName: locations.name,
  isPrimary: employeeAssignments.isPrimary,
  startDate: employeeAssignments.startDate,
  endDate: employeeAssignments.endDate,
};

function toAssignmentRow(a: AssignmentRow): AssignmentRow {
  return {
    id: a.id,
    departmentId: a.departmentId,
    departmentName: a.departmentName,
    locationId: a.locationId,
    locationName: a.locationName,
    isPrimary: a.isPrimary,
    startDate: a.startDate,
    endDate: a.endDate,
  };
}

/** 社員一覧(現在の主所属・アカウント・警告つき)。 */
export async function listEmployees(
  today: string,
  filter: EmployeeFilter = {},
): Promise<EmployeeListItem[]> {
  const conditions = [];
  if (filter.q) {
    const like = `%${filter.q.replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(
      or(
        ilike(employees.name, like),
        ilike(employees.nameKana, like),
        ilike(employees.employeeNumber, like),
      ),
    );
  }
  if (filter.status) conditions.push(eq(employees.status, filter.status as "active"));

  const rows = await db
    .select({
      employee: employees,
      positionName: positions.name,
      employmentTypeName: employmentTypes.name,
      userId: users.id,
      loginId: users.loginId,
      userStatus: users.status,
    })
    .from(employees)
    .innerJoin(employmentTypes, eq(employees.employmentTypeId, employmentTypes.id))
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .leftJoin(users, eq(users.employeeId, employees.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(employees.employeeNumber));

  const ids = rows.map((r) => r.employee.id);
  const open = ids.length
    ? await db
        .select(assignmentSelect)
        .from(employeeAssignments)
        .innerJoin(departments, eq(employeeAssignments.departmentId, departments.id))
        .innerJoin(locations, eq(employeeAssignments.locationId, locations.id))
        .where(
          and(
            inArray(employeeAssignments.employeeId, ids),
            eq(employeeAssignments.isPrimary, true),
            or(isNull(employeeAssignments.endDate), gte(employeeAssignments.endDate, today)),
          ),
        )
        .orderBy(asc(employeeAssignments.startDate))
    : [];
  const byEmployee = new Map<string, typeof open>();
  for (const a of open) {
    const list = byEmployee.get(a.employeeId) ?? [];
    list.push(a);
    byEmployee.set(a.employeeId, list);
  }

  const items = rows.map((r): EmployeeListItem => {
    const assignments = byEmployee.get(r.employee.id) ?? [];
    const current = assignments.find((a) => a.startDate <= today);
    const upcoming = assignments.find((a) => a.startDate > today);
    return {
      id: r.employee.id,
      employeeNumber: r.employee.employeeNumber,
      name: r.employee.name,
      nameKana: r.employee.nameKana,
      status: r.employee.status,
      hiredOn: r.employee.hiredOn,
      leftOn: r.employee.leftOn,
      positionName: r.positionName,
      employmentTypeName: r.employmentTypeName,
      current: current ? toAssignmentRow(current) : null,
      upcoming: upcoming ? toAssignmentRow(upcoming) : null,
      user: r.userId ? { id: r.userId, loginId: r.loginId!, status: r.userStatus! } : null,
      warnings: employeeWarnings(
        {
          status: r.employee.status,
          hiredOn: r.employee.hiredOn,
          leftOn: r.employee.leftOn,
          hasOpenPrimaryAssignment: hasOpenPrimaryAssignment(assignments, today),
          hasCurrentPrimaryAssignment: current !== undefined,
          userStatus: r.userStatus,
        },
        today,
      ),
    };
  });

  return filter.warningOnly ? items.filter((i) => i.warnings.length > 0) : items;
}

export type EmployeeDetail = {
  employee: typeof employees.$inferSelect;
  positionName: string | null;
  employmentTypeName: string;
  /** 新しい順。 */
  assignments: AssignmentRow[];
  user: { id: string; loginId: string; status: string; mustChangePassword: boolean; lastLoginAt: Date | null } | null;
  warnings: EmployeeWarning[];
  hasOpenPrimary: boolean;
};

export async function getEmployeeDetail(id: string, today: string): Promise<EmployeeDetail | null> {
  const [row] = await db
    .select({
      employee: employees,
      positionName: positions.name,
      employmentTypeName: employmentTypes.name,
      user: users,
    })
    .from(employees)
    .innerJoin(employmentTypes, eq(employees.employmentTypeId, employmentTypes.id))
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .leftJoin(users, eq(users.employeeId, employees.id))
    .where(eq(employees.id, id))
    .limit(1);
  if (!row) return null;

  const all = await db
    .select(assignmentSelect)
    .from(employeeAssignments)
    .innerJoin(departments, eq(employeeAssignments.departmentId, departments.id))
    .innerJoin(locations, eq(employeeAssignments.locationId, locations.id))
    .where(eq(employeeAssignments.employeeId, id))
    .orderBy(desc(employeeAssignments.startDate), desc(employeeAssignments.isPrimary));
  const assignments: AssignmentRow[] = all.map(toAssignmentRow);
  const hasOpenPrimary = hasOpenPrimaryAssignment(assignments, today);

  return {
    employee: row.employee,
    positionName: row.positionName,
    employmentTypeName: row.employmentTypeName,
    assignments,
    user: row.user
      ? {
          id: row.user.id,
          loginId: row.user.loginId,
          status: row.user.status,
          mustChangePassword: row.user.mustChangePassword,
          lastLoginAt: row.user.lastLoginAt,
        }
      : null,
    warnings: employeeWarnings(
      {
        status: row.employee.status,
        hiredOn: row.employee.hiredOn,
        leftOn: row.employee.leftOn,
        hasOpenPrimaryAssignment: hasOpenPrimary,
        hasCurrentPrimaryAssignment: assignments.some(
          (a) => a.isPrimary && a.startDate <= today && (a.endDate === null || a.endDate >= today),
        ),
        userStatus: row.user?.status ?? null,
      },
      today,
    ),
    hasOpenPrimary,
  };
}

export type FormOptions = {
  employmentTypes: { id: string; name: string }[];
  positions: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  locations: { id: string; name: string }[];
};

/** フォームの選択肢。有効なマスタのみ(編集中の社員が無効なマスタを参照している場合は alsoInclude で追加)。 */
export async function getFormOptions(alsoInclude: {
  employmentTypeId?: string;
  positionId?: string | null;
} = {}): Promise<FormOptions> {
  const [et, pos, dep, loc] = await Promise.all([
    db
      .select({ id: employmentTypes.id, name: employmentTypes.name })
      .from(employmentTypes)
      .where(
        or(
          eq(employmentTypes.isActive, true),
          alsoInclude.employmentTypeId ? eq(employmentTypes.id, alsoInclude.employmentTypeId) : sql`false`,
        ),
      )
      .orderBy(asc(employmentTypes.sortOrder), asc(employmentTypes.name)),
    db
      .select({ id: positions.id, name: positions.name })
      .from(positions)
      .where(
        or(
          eq(positions.isActive, true),
          alsoInclude.positionId ? eq(positions.id, alsoInclude.positionId) : sql`false`,
        ),
      )
      .orderBy(asc(positions.sortOrder), asc(positions.name)),
    db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.isActive, true))
      .orderBy(asc(departments.sortOrder), asc(departments.name)),
    db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.isActive, true))
      .orderBy(asc(locations.sortOrder), asc(locations.name)),
  ]);
  return { employmentTypes: et, positions: pos, departments: dep, locations: loc };
}
