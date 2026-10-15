import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { departments } from "../departments/schema";
import { employeeAssignments, employees } from "../employees/schema";
import { employmentTypes } from "../employment-types/schema";
import { locations } from "../locations/schema";
import { positions } from "../positions/schema";
import { portalLinks } from "../links/schema";
import { announcements } from "../notices/schema";
import { audienceConditions, audienceGroups, audiences } from "./schema";
import { definitionSchema, type AudienceDefinition } from "./definition";
import { matchesAudience, type EmployeeContext } from "./evaluate";
import type { MasterLookup } from "./summary";

export type AudienceRecord = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  definition: AudienceDefinition;
  updatedAt: Date;
};

/** 保存されている条件を読み、定義に組み立てる(壊れた条件は読み飛ばさず、検証エラーとして扱う)。 */
async function loadDefinitions(audienceIds: string[]): Promise<Map<string, AudienceDefinition>> {
  const result = new Map<string, AudienceDefinition>();
  for (const id of audienceIds) result.set(id, { groups: [] });
  if (audienceIds.length === 0) return result;

  const groups = await db
    .select()
    .from(audienceGroups)
    .where(inArray(audienceGroups.audienceId, audienceIds))
    .orderBy(asc(audienceGroups.sortOrder));
  const groupIds = groups.map((g) => g.id);
  const conditions = groupIds.length
    ? await db
        .select()
        .from(audienceConditions)
        .where(inArray(audienceConditions.groupId, groupIds))
        .orderBy(asc(audienceConditions.sortOrder))
    : [];

  const rawGroups = new Map<string, { audienceId: string; conditions: unknown[] }>();
  for (const g of groups) rawGroups.set(g.id, { audienceId: g.audienceId, conditions: [] });
  for (const c of conditions) {
    rawGroups.get(c.groupId)?.conditions.push({ attribute: c.attribute, operator: c.operator, value: c.value });
  }
  for (const g of groups) {
    const raw = rawGroups.get(g.id)!;
    const list = result.get(raw.audienceId)!;
    list.groups.push({ conditions: raw.conditions as AudienceDefinition["groups"][number]["conditions"] });
  }
  // 形式を検証する(DB を直接書き換えられた場合などに、評価で例外にならないように)
  for (const [id, def] of result) {
    const parsed = definitionSchema.safeParse(def);
    result.set(id, parsed.success ? (parsed.data as AudienceDefinition) : { groups: [] });
  }
  return result;
}

export async function listAudiences(): Promise<AudienceRecord[]> {
  const rows = await db.select().from(audiences).orderBy(asc(audiences.name));
  const defs = await loadDefinitions(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isActive: r.isActive,
    definition: defs.get(r.id)!,
    updatedAt: r.updatedAt,
  }));
}

export async function getAudience(id: string): Promise<AudienceRecord | null> {
  const [row] = await db.select().from(audiences).where(eq(audiences.id, id)).limit(1);
  if (!row) return null;
  const defs = await loadDefinitions([row.id]);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    definition: defs.get(row.id)!,
    updatedAt: row.updatedAt,
  };
}

/** 評価の対象になる社員(全員)の情報。人数は数百人規模なので、全員分を読み込んでメモリ上で評価する。 */
export type EvaluationPopulation = {
  contexts: EmployeeContext[];
  info: Map<string, { name: string; employeeNumber: string; affiliation: string }>;
};

export async function loadPopulation(today: string): Promise<EvaluationPopulation> {
  const [emps, active] = await Promise.all([
    db
      .select({
        employee: employees,
        positionIsManagement: positions.isManagement,
      })
      .from(employees)
      .leftJoin(positions, eq(employees.positionId, positions.id))
      .orderBy(asc(employees.employeeNumber)),
    db
      .select({
        employeeId: employeeAssignments.employeeId,
        departmentId: employeeAssignments.departmentId,
        departmentName: departments.name,
        locationId: employeeAssignments.locationId,
        locationName: locations.name,
        isPrimary: employeeAssignments.isPrimary,
      })
      .from(employeeAssignments)
      .innerJoin(departments, eq(employeeAssignments.departmentId, departments.id))
      .innerJoin(locations, eq(employeeAssignments.locationId, locations.id))
      .where(
        and(
          lte(employeeAssignments.startDate, today),
          or(isNull(employeeAssignments.endDate), gte(employeeAssignments.endDate, today)),
        ),
      ),
  ]);

  const byEmployee = new Map<string, typeof active>();
  for (const a of active) {
    const list = byEmployee.get(a.employeeId) ?? [];
    list.push(a);
    byEmployee.set(a.employeeId, list);
  }

  const info: EvaluationPopulation["info"] = new Map();
  const contexts = emps.map(({ employee: e, positionIsManagement }): EmployeeContext => {
    const assignments = byEmployee.get(e.id) ?? [];
    const primary = assignments.find((a) => a.isPrimary) ?? assignments[0];
    info.set(e.id, {
      name: e.name,
      employeeNumber: e.employeeNumber,
      affiliation: primary ? `${primary.locationName} / ${primary.departmentName}` : "所属未設定",
    });
    return {
      employeeId: e.id,
      status: e.status,
      hiredOn: e.hiredOn,
      leftOn: e.leftOn,
      positionId: e.positionId,
      positionIsManagement: positionIsManagement ?? false,
      employmentTypeId: e.employmentTypeId,
      assignments: assignments.map((a) => ({ departmentId: a.departmentId, locationId: a.locationId })),
    };
  });
  return { contexts, info };
}

/** 条件に当てはまる社員(いまアクセスできる人のみ)。 */
export function evaluateDefinition(
  definition: AudienceDefinition,
  population: EvaluationPopulation,
  today: string,
) {
  return population.contexts
    .filter((ctx) => matchesAudience(definition, ctx, today))
    .map((ctx) => ({ employeeId: ctx.employeeId, ...population.info.get(ctx.employeeId)! }));
}

/** 無効・削除済みを含む全マスタの名称(Audience の条件の表示と、無効なマスタの参照の検出用)。 */
export async function loadMasterLookup(): Promise<MasterLookup> {
  const [dep, loc, pos, et] = await Promise.all([
    db.select({ id: departments.id, name: departments.name, isActive: departments.isActive }).from(departments),
    db.select({ id: locations.id, name: locations.name, isActive: locations.isActive }).from(locations),
    db.select({ id: positions.id, name: positions.name, isActive: positions.isActive }).from(positions),
    db
      .select({ id: employmentTypes.id, name: employmentTypes.name, isActive: employmentTypes.isActive })
      .from(employmentTypes),
  ]);
  const toMap = (rows: { id: string; name: string; isActive: boolean }[]) =>
    new Map(rows.map((r) => [r.id, { name: r.name, isActive: r.isActive }]));
  return {
    department: toMap(dep),
    location: toMap(loc),
    position: toMap(pos),
    employment_type: toMap(et),
  };
}

export type MasterOption = { id: string; name: string; isActive: boolean };
export type MasterOptions = {
  department: MasterOption[];
  location: MasterOption[];
  position: MasterOption[];
  employment_type: MasterOption[];
};

export function lookupToOptions(lookup: MasterLookup): MasterOptions {
  const toList = (m: MasterLookup["department"]): MasterOption[] =>
    [...m.entries()].map(([id, v]) => ({ id, name: v.name, isActive: v.isActive })).sort((a, b) => a.name.localeCompare(b.name, "ja"));
  return {
    department: toList(lookup.department),
    location: toList(lookup.location),
    position: toList(lookup.position),
    employment_type: toList(lookup.employment_type),
  };
}

/**
 * この Audience の利用先(お知らせ・社内リンク。手順 6 でアプリを加える)。
 * 利用中の Audience は削除できない(下書き・終了済みのお知らせ、無効のリンクも利用中として数える)。
 */
export async function listAudienceUsages(audienceId: string): Promise<{ kind: string; name: string }[]> {
  const [notices, links] = await Promise.all([
    db
      .select({ title: announcements.title })
      .from(announcements)
      .where(eq(announcements.audienceId, audienceId)),
    db.select({ title: portalLinks.title }).from(portalLinks).where(eq(portalLinks.audienceId, audienceId)),
  ]);
  return [
    ...notices.map((n) => ({ kind: "お知らせ", name: `お知らせ「${n.title}」` })),
    ...links.map((l) => ({ kind: "社内リンク", name: `社内リンク「${l.title}」` })),
  ];
}

/** 有効な Audience の定義(無効・存在しない Audience は含めない = 誰にも当てはまらない)。 */
export async function loadActiveDefinitions(audienceIds: string[]): Promise<Map<string, AudienceDefinition>> {
  const ids = [...new Set(audienceIds)];
  if (ids.length === 0) return new Map();
  const active = await db
    .select({ id: audiences.id })
    .from(audiences)
    .where(and(inArray(audiences.id, ids), eq(audiences.isActive, true)));
  return loadDefinitions(active.map((a) => a.id));
}

/**
 * 社員が当てはまる Audience(指定した中から、有効なものだけ)。社員でないアカウントは空。
 * お知らせ・社内リンクなど、見る人ごとの表示の判定に使う(単一社員の判定と同じ matchesAudience)。
 */
export async function matchedAudienceIds(
  employeeId: string | null,
  audienceIds: string[],
  today: string,
): Promise<Set<string>> {
  if (employeeId === null || audienceIds.length === 0) return new Set();
  const [definitions, ctx] = await Promise.all([
    loadActiveDefinitions(audienceIds),
    loadEmployeeContext(employeeId, today),
  ]);
  if (!ctx) return new Set();
  return new Set([...definitions].filter(([, def]) => matchesAudience(def, ctx, today)).map(([id]) => id));
}

/** 1 人の社員の、評価用の情報(loadPopulation と同じ形)。社員がいなければ null。 */
export async function loadEmployeeContext(employeeId: string, today: string): Promise<EmployeeContext | null> {
  const [row] = await db
    .select({ employee: employees, positionIsManagement: positions.isManagement })
    .from(employees)
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .where(eq(employees.id, employeeId));
  if (!row) return null;
  const active = await db
    .select({ departmentId: employeeAssignments.departmentId, locationId: employeeAssignments.locationId })
    .from(employeeAssignments)
    .where(
      and(
        eq(employeeAssignments.employeeId, employeeId),
        lte(employeeAssignments.startDate, today),
        or(isNull(employeeAssignments.endDate), gte(employeeAssignments.endDate, today)),
      ),
    );
  const e = row.employee;
  return {
    employeeId: e.id,
    status: e.status,
    hiredOn: e.hiredOn,
    leftOn: e.leftOn,
    positionId: e.positionId,
    positionIsManagement: row.positionIsManagement ?? false,
    employmentTypeId: e.employmentTypeId,
    assignments: active,
  };
}
