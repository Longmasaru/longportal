import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { departments } from "@/modules/core/departments/schema";
import { employeeAssignments, employees } from "@/modules/core/employees/schema";
import { locations } from "@/modules/core/locations/schema";
import { compareMembers, isOnRoster } from "./logic";
import { nakamaMembers } from "./schema";
import type { NakamaMember } from "./types";

/** 基準日(JST)の主所属(部署・拠点の名前つき)。1 人 1 件(主所属の期間重複は DB の排他制約で禁止)。 */
async function primaryAssignments(today: string) {
  const rows = await db
    .select({
      employeeId: employeeAssignments.employeeId,
      departmentId: employeeAssignments.departmentId,
      departmentName: departments.name,
      departmentSortOrder: departments.sortOrder,
      locationName: locations.name,
    })
    .from(employeeAssignments)
    .innerJoin(departments, eq(employeeAssignments.departmentId, departments.id))
    .innerJoin(locations, eq(employeeAssignments.locationId, locations.id))
    .where(
      and(
        eq(employeeAssignments.isPrimary, true),
        lte(employeeAssignments.startDate, today),
        or(isNull(employeeAssignments.endDate), gte(employeeAssignments.endDate, today)),
      ),
    );
  return new Map(rows.map((r) => [r.employeeId, r]));
}

/** 名簿に載っている在籍者(並び順つき)。退職した人は、行が残っていても出さない。 */
export async function listNakamaMembers(today: string): Promise<NakamaMember[]> {
  const [people, primaryOf] = await Promise.all([
    db
      .select({
        employeeId: employees.id,
        employeeNumber: employees.employeeNumber,
        name: employees.name,
        nameKana: employees.nameKana,
        hiredOn: employees.hiredOn,
        leftOn: employees.leftOn,
        status: employees.status,
        nativeName: nakamaMembers.nativeName,
        nickname: nakamaMembers.nickname,
        arrivedOn: nakamaMembers.arrivedOn,
        hometown: nakamaMembers.hometown,
        note: nakamaMembers.note,
        residenceStatus: nakamaMembers.residenceStatus,
        residenceExpiresOn: nakamaMembers.residenceExpiresOn,
      })
      .from(nakamaMembers)
      .innerJoin(employees, eq(nakamaMembers.employeeId, employees.id)),
    primaryAssignments(today),
  ]);

  return people
    .filter((p) => isOnRoster(p, today))
    .map((p) => {
      const a = primaryOf.get(p.employeeId);
      return {
        employeeId: p.employeeId,
        employeeNumber: p.employeeNumber,
        name: p.name,
        nameKana: p.nameKana,
        hiredOn: p.hiredOn,
        nativeName: p.nativeName,
        nickname: p.nickname,
        arrivedOn: p.arrivedOn,
        hometown: p.hometown,
        note: p.note,
        residenceStatus: p.residenceStatus,
        residenceExpiresOn: p.residenceExpiresOn,
        departmentId: a?.departmentId ?? null,
        departmentName: a?.departmentName ?? null,
        departmentSortOrder: a?.departmentSortOrder ?? null,
        locationName: a?.locationName ?? null,
      };
    })
    .sort(compareMembers);
}

/** 名簿の 1 人(在籍者でなくても返す。編集の画面用)。 */
export async function getNakamaMember(employeeId: string) {
  const [row] = await db
    .select({
      employeeId: employees.id,
      employeeNumber: employees.employeeNumber,
      name: employees.name,
      nameKana: employees.nameKana,
      nativeName: nakamaMembers.nativeName,
      nickname: nakamaMembers.nickname,
      arrivedOn: nakamaMembers.arrivedOn,
      hometown: nakamaMembers.hometown,
      note: nakamaMembers.note,
      residenceStatus: nakamaMembers.residenceStatus,
      residenceExpiresOn: nakamaMembers.residenceExpiresOn,
    })
    .from(nakamaMembers)
    .innerJoin(employees, eq(nakamaMembers.employeeId, employees.id))
    .where(eq(nakamaMembers.employeeId, employeeId))
    .limit(1);
  return row ?? null;
}

/** 名簿に足せる人(在籍者で、まだ名簿にいない人)。社員番号の順。 */
export async function listAddableEmployees(today: string) {
  const rows = await db
    .select({
      employeeId: employees.id,
      employeeNumber: employees.employeeNumber,
      name: employees.name,
      nameKana: employees.nameKana,
      hiredOn: employees.hiredOn,
      leftOn: employees.leftOn,
      status: employees.status,
      listed: nakamaMembers.employeeId,
    })
    .from(employees)
    .leftJoin(nakamaMembers, eq(nakamaMembers.employeeId, employees.id))
    .orderBy(asc(employees.employeeNumber));
  return rows
    .filter((r) => r.listed === null && isOnRoster(r, today))
    .map((r) => ({ employeeId: r.employeeId, employeeNumber: r.employeeNumber, name: r.name, nameKana: r.nameKana }));
}

/** 名簿に載っている人がいる部署(絞り込みの選択肢。部署の表示順)。 */
export function departmentsOf(members: readonly NakamaMember[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const m of members) if (m.departmentId && m.departmentName) seen.set(m.departmentId, m.departmentName);
  return [...seen].map(([id, name]) => ({ id, name }));
}

/** 名簿に載っている在籍者か(写真の入口の判定用)。 */
export async function isListedOnRoster(employeeId: string, today: string): Promise<boolean> {
  const [row] = await db
    .select({ hiredOn: employees.hiredOn, leftOn: employees.leftOn, status: employees.status })
    .from(nakamaMembers)
    .innerJoin(employees, eq(nakamaMembers.employeeId, employees.id))
    .where(eq(nakamaMembers.employeeId, employeeId))
    .limit(1);
  return row ? isOnRoster(row, today) : false;
}
