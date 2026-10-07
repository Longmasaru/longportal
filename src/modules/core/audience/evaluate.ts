// Audience の評価(純粋な関数)。docs/DESIGN.md 7.2。
import { evaluateEmployeeAccess } from "../access/evaluate";
import {
  isAssignmentCondition,
  type AssignmentCondition,
  type AudienceCondition,
  type AudienceDefinition,
  type AudienceGroup,
} from "./definition";

/** 評価に必要な社員の情報。 */
export type EmployeeContext = {
  employeeId: string;
  status: string;
  /** `YYYY-MM-DD` */
  hiredOn: string;
  leftOn: string | null;
  positionId: string | null;
  /** 役職の「管理職」フラグ。役職なしは false。 */
  positionIsManagement: boolean;
  employmentTypeId: string;
  /** 基準日に有効な所属(主所属・副所属を問わない)。 */
  assignments: { departmentId: string; locationId: string }[];
};

/** 入社からの満の月数。入社日が基準日より後なら負の値。 */
export function monthsOfTenure(hiredOn: string, today: string): number {
  const [hy, hm, hd] = hiredOn.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return (ty - hy) * 12 + (tm - hm) - (td < hd ? 1 : 0);
}

function employeeConditionHolds(c: AudienceCondition, ctx: EmployeeContext, today: string): boolean {
  switch (c.attribute) {
    case "position":
      return ctx.positionId !== null && c.value.includes(ctx.positionId);
    case "employment_type":
      return c.value.includes(ctx.employmentTypeId);
    case "is_management":
      return ctx.positionIsManagement === c.value;
    case "tenure_months": {
      const months = monthsOfTenure(ctx.hiredOn, today);
      return c.operator === "lt" ? months < c.value : months >= c.value;
    }
    default:
      // 所属条件(department / location)は assignmentConditionHolds で評価する。
      return true;
  }
}

function assignmentConditionHolds(
  c: AssignmentCondition,
  a: { departmentId: string; locationId: string },
): boolean {
  return c.attribute === "department" ? c.value.includes(a.departmentId) : c.value.includes(a.locationId);
}

/**
 * 1 つのグループ(AND)の判定。
 * - 社員条件は、社員本人に対して評価する。
 * - 所属条件は、**基準日に有効な 1 件の所属が、所属条件をすべて満たす**場合だけ成立する
 *   (兼務の人が「白山工場の溶接」と「現工場のブレーキ」を持っていても、「白山工場かつブレーキ」には入らない)。
 * - 所属条件がなければ所属は見ない(配属未確定の社員も、社員条件だけなら対象になりうる)。
 */
export function matchesGroup(group: AudienceGroup, ctx: EmployeeContext, today: string): boolean {
  const employeeConditions = group.conditions.filter((c) => !isAssignmentCondition(c));
  const assignmentConditions = group.conditions.filter(isAssignmentCondition);

  if (!employeeConditions.every((c) => employeeConditionHolds(c, ctx, today))) return false;
  if (assignmentConditions.length === 0) return true;
  return ctx.assignments.some((a) => assignmentConditions.every((c) => assignmentConditionHolds(c, a)));
}

/**
 * 社員が Audience の対象かどうか。グループ間は OR。
 * 前提として、いまアクセスできない社員(退職済み・入社前・入社予定など)は対象にしない。
 */
export function matchesAudience(
  definition: AudienceDefinition,
  ctx: EmployeeContext,
  today: string,
): boolean {
  if (evaluateEmployeeAccess(ctx, today) !== null) return false;
  return definition.groups.some((g) => matchesGroup(g, ctx, today));
}
