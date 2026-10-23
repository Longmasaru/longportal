import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { departments } from "@/modules/core/departments/schema";
import { employeeAssignments, employees } from "@/modules/core/employees/schema";
import { locations } from "@/modules/core/locations/schema";
import { positions } from "@/modules/core/positions/schema";
import { isOnRoster } from "./logic";
import type { OrgMember, OrgUnit } from "./types";

/** 有効な部署(箱の並び順つき)。 */
export async function listDepartments(): Promise<OrgUnit[]> {
  return db
    .select({ id: departments.id, code: departments.code, name: departments.name, sortOrder: departments.sortOrder })
    .from(departments)
    .where(eq(departments.isActive, true))
    .orderBy(asc(departments.sortOrder), asc(departments.code));
}

/** 有効な拠点(絞り込みの選択肢)。 */
export async function listLocations(): Promise<OrgUnit[]> {
  return db
    .select({ id: locations.id, code: locations.code, name: locations.name, sortOrder: locations.sortOrder })
    .from(locations)
    .where(eq(locations.isActive, true))
    .orderBy(asc(locations.sortOrder), asc(locations.code));
}

/** 基準日(JST)に在籍している社員と、その日の主所属。主所属がない人も含める(箱は「所属なし」)。 */
export async function listOrgMembers(today: string): Promise<OrgMember[]> {
  const people = await db
    .select({
      employeeId: employees.id,
      employeeNumber: employees.employeeNumber,
      name: employees.name,
      familyName: employees.familyName,
      givenName: employees.givenName,
      nameKana: employees.nameKana,
      positionName: positions.name,
      isManagement: positions.isManagement,
      positionRank: positions.rank,
      positionSortOrder: positions.sortOrder,
      hiredOn: employees.hiredOn,
      leftOn: employees.leftOn,
      status: employees.status,
    })
    .from(employees)
    .leftJoin(positions, eq(employees.positionId, positions.id));

  const primaries = await db
    .select({
      employeeId: employeeAssignments.employeeId,
      departmentId: employeeAssignments.departmentId,
      locationId: employeeAssignments.locationId,
      locationName: locations.name,
    })
    .from(employeeAssignments)
    .innerJoin(locations, eq(employeeAssignments.locationId, locations.id))
    .where(
      and(
        eq(employeeAssignments.isPrimary, true),
        lte(employeeAssignments.startDate, today),
        or(isNull(employeeAssignments.endDate), gte(employeeAssignments.endDate, today)),
      ),
    );
  // 主所属の期間重複は DB の排他制約で禁止されているので、1 人 1 件。
  const primaryOf = new Map(primaries.map((p) => [p.employeeId, p]));

  return people
    .filter((p) => isOnRoster(p, today))
    .map((p) => {
      const a = primaryOf.get(p.employeeId);
      return {
        employeeId: p.employeeId,
        employeeNumber: p.employeeNumber,
        name: p.name,
        familyName: p.familyName,
        givenName: p.givenName,
        nameKana: p.nameKana,
        positionName: p.positionName,
        isManagement: p.isManagement ?? false,
        positionRank: p.positionRank,
        positionSortOrder: p.positionSortOrder,
        hiredOn: p.hiredOn,
        departmentId: a?.departmentId ?? null,
        locationId: a?.locationId ?? null,
        locationName: a?.locationName ?? null,
      };
    });
}
