import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, max, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import type { Actor } from "@/modules/core/access";
import { users } from "@/modules/core/auth/schema";
import { departments } from "@/modules/core/departments/schema";
import { employeeAssignments, employees } from "@/modules/core/employees/schema";
import { employmentTypes } from "@/modules/core/employment-types/schema";
import { locations } from "@/modules/core/locations/schema";
import { positions } from "@/modules/core/positions/schema";
import { canManageEmployee, pageMode, reportsOf, visibilitiesFor, type NameParts, type PageMode, type SupervisorMap } from "./logic";
import { HR_RECORDS_MANAGE } from "./manifest";
import {
  hrAbilities,
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

/** 社員 → 直属の上司(31.4)。 */
export async function getSupervisorMap(): Promise<Map<string, string>> {
  const rows = await db
    .select({ employeeId: hrProfiles.employeeId, supervisorId: hrProfiles.supervisorEmployeeId })
    .from(hrProfiles)
    .where(isNotNull(hrProfiles.supervisorEmployeeId));
  return new Map(rows.map((r) => [r.employeeId, r.supervisorId!]));
}

/** 見る人の部下全員(直属とその下)。社員が紐づいていなければ空。 */
export async function reportsOfActor(actor: Actor, supervisors?: SupervisorMap): Promise<Set<string>> {
  if (!actor.employee) return new Set();
  return reportsOf(actor.employee.id, supervisors ?? (await getSupervisorMap()));
}

/** 見る人と社員の関係から、ページの見え方を決める(対象の社員の今日の所属でスコープを判定)。 */
export async function modeFor(actor: Actor, profile: EmployeeProfile): Promise<PageMode> {
  const canManage = canManageEmployee(actor.grants, HR_RECORDS_MANAGE, profile.assignments);
  const isSupervisor = !canManage && (await reportsOfActor(actor)).has(profile.id);
  return pageMode(actor.employee?.id ?? null, profile.id, canManage, isSupervisor);
}

export type EmployeeListRow = EmployeeProfile & { recordCount: number; lastRecordOn: string | null };

/**
 * 一覧に出す社員(自分・管理できる社員・部下。31.4)。退職者は includeRetired のときだけ。
 * 記録の件数・最新の日付は、見る人に見える記録だけで数える(自分の行は「本人に公開」、管理できない部下の行は「上司まで」も)。
 */
export async function listManagedEmployees(
  actor: Actor,
  options: { q?: string; includeRetired?: boolean; reports: Set<string> },
): Promise<EmployeeListRow[]> {
  const rows = await db
    .select(profileColumns)
    .from(employees)
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .leftJoin(employmentTypes, eq(employees.employmentTypeId, employmentTypes.id))
    .orderBy(asc(employees.employeeNumber));
  const assignmentMap = await currentAssignments(actor.today);
  const isPublic = sql`${hrRecords.visibility} in ('employee', 'personal')`;
  const isForSupervisors = sql`${hrRecords.visibility} in ('employee', 'supervisors')`;
  const counts = await db
    .select({
      employeeId: hrRecords.employeeId,
      n: count(),
      last: max(hrRecords.occurredOn),
      publicN: sql<number>`(count(*) filter (where ${isPublic}))::int`,
      publicLast: sql<string | null>`max(${hrRecords.occurredOn}) filter (where ${isPublic})`,
      supN: sql<number>`(count(*) filter (where ${isForSupervisors}))::int`,
      supLast: sql<string | null>`max(${hrRecords.occurredOn}) filter (where ${isForSupervisors})`,
    })
    .from(hrRecords)
    .groupBy(hrRecords.employeeId);
  const countMap = new Map(counts.map((c) => [c.employeeId, c]));

  const q = options.q?.trim().toLowerCase();
  return rows
    .map((r) => ({ ...r, assignments: assignmentMap.get(r.id) ?? [] }))
    .filter((r) => options.includeRetired || r.status !== "retired")
    .map((r) => ({ ...r, canManage: canManageEmployee(actor.grants, HR_RECORDS_MANAGE, r.assignments) }))
    .filter((r) => r.id === actor.employee?.id || r.canManage || options.reports.has(r.id))
    .filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.nameKana ?? "").toLowerCase().includes(q) ||
        r.employeeNumber.toLowerCase().includes(q),
    )
    .map(({ canManage, ...r }) => {
      const c = countMap.get(r.id);
      // 自分の行も、本人に見える記録だけで数える(自分のページは本人の見え方のため)。数え方は visibilitiesFor と同じ。
      const mode = pageMode(actor.employee?.id ?? null, r.id, canManage, options.reports.has(r.id));
      const [n, last] =
        mode === "manager" ? [c?.n, c?.last] : mode === "supervisor" ? [c?.supN, c?.supLast] : [c?.publicN, c?.publicLast];
      return { ...r, recordCount: n ?? 0, lastRecordOn: last ?? null };
    });
}

/** 上司を選ぶ欄の候補(退職者を除く全社員。31.4)。 */
export async function listSupervisorCandidates(): Promise<{ id: string; name: string; employeeNumber: string }[]> {
  return db
    .select({ id: employees.id, name: employees.name, employeeNumber: employees.employeeNumber })
    .from(employees)
    .where(ne(employees.status, "retired"))
    .orderBy(asc(employees.employeeNumber));
}

const authorEmployees = alias(employees, "author_employees");

/** 社員の記録(新しい順)。見え方で見られる公開範囲の記録だけを DB から読む。 */
export async function listRecords(employeeId: string, mode: Exclude<PageMode, "none">): Promise<HrRecord[]> {
  return db
    .select({
      id: hrRecords.id,
      kind: hrRecords.kind,
      occurredOn: hrRecords.occurredOn,
      title: hrRecords.title,
      body: hrRecords.body,
      visibility: hrRecords.visibility,
      authorUserId: hrRecords.authorUserId,
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
        inArray(hrRecords.visibility, [...visibilitiesFor(mode)]),
      ),
    )
    .orderBy(desc(hrRecords.occurredOn), desc(hrRecords.createdAt));
}

/** 氏名の部品(AI に送る前に伏せるため。31.3)。 */
export async function getNameParts(employeeId: string): Promise<NameParts | null> {
  const [row] = await db
    .select({
      familyName: employees.familyName,
      givenName: employees.givenName,
      familyNameKana: employees.familyNameKana,
      givenNameKana: employees.givenNameKana,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return row ?? null;
}

/** 記録 1 件(更新・削除の前の確認用)。 */
export async function getRecord(id: string) {
  const [row] = await db.select().from(hrRecords).where(eq(hrRecords.id, id)).limit(1);
  return row ?? null;
}

/** 人事管理シートの 1〜5 章(31.1)。章の出し分けは画面側(SECTION_VISIBLE_TO_SELF)で行う。 */
export async function getSheet(employeeId: string): Promise<HrSheet> {
  const [[profile], [master], qualifications, skills, trainings, conditions, abilityRows, directReports] = await Promise.all([
    db.select().from(hrProfiles).where(eq(hrProfiles.employeeId, employeeId)).limit(1),
    db.select({ birthDate: employees.birthDate }).from(employees).where(eq(employees.id, employeeId)).limit(1),
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
    db.select({ axis: hrAbilities.axis, level: hrAbilities.level }).from(hrAbilities).where(eq(hrAbilities.employeeId, employeeId)),
    db
      .select({ id: employees.id, name: employees.name })
      .from(hrProfiles)
      .innerJoin(employees, eq(hrProfiles.employeeId, employees.id))
      .where(and(eq(hrProfiles.supervisorEmployeeId, employeeId), ne(employees.status, "retired")))
      .orderBy(asc(employees.employeeNumber)),
  ]);
  const supervisor = profile?.supervisorEmployeeId
    ? ((await db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(eq(employees.id, profile.supervisorEmployeeId))
        .limit(1))[0] ?? null)
    : null;
  const abilities: HrSheet["abilities"] = {};
  for (const a of abilityRows) abilities[a.axis] = a.level;
  return {
    profile: profile ?? null,
    birthDate: master?.birthDate ?? null,
    qualifications,
    skills,
    trainings,
    conditions,
    abilities,
    supervisor,
    directReports,
  };
}
