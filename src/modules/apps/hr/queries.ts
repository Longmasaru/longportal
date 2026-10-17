import { and, asc, count, desc, eq, gte, inArray, isNull, lte, max, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import type { Actor } from "@/modules/core/access";
import { users } from "@/modules/core/auth/schema";
import { departments } from "@/modules/core/departments/schema";
import { employeeAssignments, employees } from "@/modules/core/employees/schema";
import { employmentTypes } from "@/modules/core/employment-types/schema";
import { locations } from "@/modules/core/locations/schema";
import { positions } from "@/modules/core/positions/schema";
import { canManageEmployee, pageMode, type PageMode } from "./logic";
import { HR_RECORDS_MANAGE } from "./manifest";
import {
  hrConditionChecks,
  hrProfiles,
  hrQualifications,
  hrRecords,
  hrSkills,
  hrTrainings,
} from "./schema";
import type { EmployeeProfile, HrRecord, HrSheet, ProfileAssignment } from "./types";

/** 基準日(JST)に有効な所属(主所属が先頭)。employeeIds を省略すると全社員。 */
async function currentAssignments(today: string, employeeIds?: string[]): Promise<Map<string, ProfileAssignment[]>> {
  const rows = await db
    .select({
      employeeId: employeeAssignments.employeeId,
      locationId: employeeAssignments.locationId,
      locationName: locations.name,
      departmentId: employeeAssignments.departmentId,
      departmentName: departments.name,
      isPrimary: employeeAssignments.isPrimary,
    })
    .from(employeeAssignments)
    .innerJoin(departments, eq(employeeAssignments.departmentId, departments.id))
    .innerJoin(locations, eq(employeeAssignments.locationId, locations.id))
    .where(
      and(
        employeeIds ? inArray(employeeAssignments.employeeId, employeeIds) : undefined,
        lte(employeeAssignments.startDate, today),
        or(isNull(employeeAssignments.endDate), gte(employeeAssignments.endDate, today)),
      ),
    )
    .orderBy(desc(employeeAssignments.isPrimary), asc(employeeAssignments.startDate));
  const map = new Map<string, ProfileAssignment[]>();
  for (const { employeeId, ...a } of rows) {
    const list = map.get(employeeId) ?? [];
    list.push(a);
    map.set(employeeId, list);
  }
  return map;
}

const profileColumns = {
  id: employees.id,
  employmentTypeName: employmentTypes.name,
  employeeNumber: employees.employeeNumber,
  name: employees.name,
  nameKana: employees.nameKana,
  positionName: positions.name,
  hiredOn: employees.hiredOn,
  leftOn: employees.leftOn,
  status: employees.status,
};

/** 社員のページの基本情報。見つからなければ null。 */
export async function getEmployeeProfile(employeeId: string, today: string): Promise<EmployeeProfile | null> {
  const [row] = await db
    .select(profileColumns)
    .from(employees)
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .leftJoin(employmentTypes, eq(employees.employmentTypeId, employmentTypes.id))
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) return null;
  const assignments = (await currentAssignments(today, [employeeId])).get(employeeId) ?? [];
  return { ...row, assignments };
}

/** 見る人と社員の関係から、ページの見え方を決める(対象の社員の今日の所属でスコープを判定)。 */
export function modeFor(actor: Actor, profile: EmployeeProfile): PageMode {
  const canManage = canManageEmployee(actor.grants, HR_RECORDS_MANAGE, profile.assignments);
  return pageMode(actor.employee?.id ?? null, profile.id, canManage);
}

export type EmployeeListRow = EmployeeProfile & { recordCount: number; lastRecordOn: string | null };

/** 管理する人の一覧(スコープ内の社員だけ。本人も含む)。退職者は includeRetired のときだけ。 */
export async function listManagedEmployees(
  actor: Actor,
  options: { q?: string; includeRetired?: boolean },
): Promise<EmployeeListRow[]> {
  const rows = await db
    .select(profileColumns)
    .from(employees)
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .leftJoin(employmentTypes, eq(employees.employmentTypeId, employmentTypes.id))
    .orderBy(asc(employees.employeeNumber));
  const assignmentMap = await currentAssignments(actor.today);
  const counts = await db
    .select({ employeeId: hrRecords.employeeId, n: count(), last: max(hrRecords.occurredOn) })
    .from(hrRecords)
    .groupBy(hrRecords.employeeId);
  const countMap = new Map(counts.map((c) => [c.employeeId, c]));

  const q = options.q?.trim().toLowerCase();
  return rows
    .map((r) => ({ ...r, assignments: assignmentMap.get(r.id) ?? [] }))
    .filter((r) => options.includeRetired || r.status !== "retired")
    .filter((r) => r.id === actor.employee?.id || canManageEmployee(actor.grants, HR_RECORDS_MANAGE, r.assignments))
    .filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.nameKana ?? "").toLowerCase().includes(q) ||
        r.employeeNumber.toLowerCase().includes(q),
    )
    .map((r) => ({
      ...r,
      recordCount: countMap.get(r.id)?.n ?? 0,
      lastRecordOn: countMap.get(r.id)?.last ?? null,
    }));
}

const authorEmployees = alias(employees, "author_employees");

/** 社員の記録(新しい順)。本人の見え方では、公開の記録だけを DB から読む。 */
export async function listRecords(employeeId: string, mode: Exclude<PageMode, "none">): Promise<HrRecord[]> {
  return db
    .select({
      id: hrRecords.id,
      kind: hrRecords.kind,
      occurredOn: hrRecords.occurredOn,
      title: hrRecords.title,
      body: hrRecords.body,
      visibility: hrRecords.visibility,
      authorName: authorEmployees.name,
      authorLoginId: users.loginId,
      updatedAt: hrRecords.updatedAt,
    })
    .from(hrRecords)
    .leftJoin(users, eq(hrRecords.authorUserId, users.id))
    .leftJoin(authorEmployees, eq(users.employeeId, authorEmployees.id))
    .where(
      and(
        eq(hrRecords.employeeId, employeeId),
        mode === "self" ? eq(hrRecords.visibility, "employee") : undefined,
      ),
    )
    .orderBy(desc(hrRecords.occurredOn), desc(hrRecords.createdAt));
}

/** 記録 1 件(更新・削除の前の確認用)。 */
export async function getRecord(id: string) {
  const [row] = await db.select().from(hrRecords).where(eq(hrRecords.id, id)).limit(1);
  return row ?? null;
}

/** 人事管理シートの 1〜5 章(31.1)。章の出し分けは画面側(SECTION_VISIBLE_TO_SELF)で行う。 */
export async function getSheet(employeeId: string): Promise<HrSheet> {
  const [[profile], qualifications, skills, trainings, conditions] = await Promise.all([
    db.select().from(hrProfiles).where(eq(hrProfiles.employeeId, employeeId)).limit(1),
    db
      .select({ id: hrQualifications.id, name: hrQualifications.name, acquiredOn: hrQualifications.acquiredOn, expiresOn: hrQualifications.expiresOn })
      .from(hrQualifications)
      .where(eq(hrQualifications.employeeId, employeeId))
      .orderBy(sql`${hrQualifications.acquiredOn} desc nulls last`, asc(hrQualifications.createdAt)),
    db
      .select({ id: hrSkills.id, name: hrSkills.name, level: hrSkills.level })
      .from(hrSkills)
      .where(eq(hrSkills.employeeId, employeeId))
      .orderBy(desc(hrSkills.level), asc(hrSkills.createdAt)),
    db
      .select({ id: hrTrainings.id, kind: hrTrainings.kind, title: hrTrainings.title, takenOn: hrTrainings.takenOn })
      .from(hrTrainings)
      .where(eq(hrTrainings.employeeId, employeeId))
      .orderBy(sql`${hrTrainings.takenOn} desc nulls last`, asc(hrTrainings.createdAt)),
    db
      .select({
        id: hrConditionChecks.id,
        checkedOn: hrConditionChecks.checkedOn,
        health: hrConditionChecks.health,
        mental: hrConditionChecks.mental,
        satisfaction: hrConditionChecks.satisfaction,
        note: hrConditionChecks.note,
      })
      .from(hrConditionChecks)
      .where(eq(hrConditionChecks.employeeId, employeeId))
      .orderBy(desc(hrConditionChecks.checkedOn), desc(hrConditionChecks.createdAt)),
  ]);
  return { profile: profile ?? null, qualifications, skills, trainings, conditions };
}
