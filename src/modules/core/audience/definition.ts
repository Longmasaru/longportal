// Audience(対象者の条件)の定義。DB・セッションに依存しない(クライアントからも参照できる)。
// docs/DESIGN.md 7 章:
// - 条件を保存し、見るたびに現在の社員マスタに対して評価する(社員 ID の一覧は保存しない)。
// - 1 つのグループの中は AND、複数のグループ間は OR(入れ子は 2 階層まで)。
// - グループが 0 個 = 誰も対象にならない(deny by default)。条件が 0 個のグループ = 全員(「全社員」)。
import { z } from "zod";

export const MAX_GROUPS = 10;
export const MAX_CONDITIONS_PER_GROUP = 10;

/** 所属条件: 1 件の所属(部署と拠点の組)に対して評価する。 */
export const ASSIGNMENT_ATTRIBUTES = ["department", "location"] as const;
/** 社員条件: 社員本人に対して評価する。 */
export const EMPLOYEE_ATTRIBUTES = ["position", "employment_type", "is_management", "tenure_months"] as const;
export const CONDITION_ATTRIBUTES = [...ASSIGNMENT_ATTRIBUTES, ...EMPLOYEE_ATTRIBUTES] as const;
export type ConditionAttribute = (typeof CONDITION_ATTRIBUTES)[number];

/** マスタの ID を保存する(名称変更に強くするため)。 */
export type MasterListAttribute = "department" | "location" | "position" | "employment_type";

/** 所属条件(1 件の所属に対して評価する)。 */
export type AssignmentCondition = {
  attribute: "department" | "location";
  operator: "in";
  value: string[];
};

export type AudienceCondition =
  | AssignmentCondition
  | { attribute: "position" | "employment_type"; operator: "in"; value: string[] }
  | { attribute: "is_management"; operator: "is"; value: boolean }
  | { attribute: "tenure_months"; operator: "lt" | "gte"; value: number };

export type AudienceGroup = { conditions: AudienceCondition[] };
export type AudienceDefinition = { groups: AudienceGroup[] };

export const ATTRIBUTE_LABEL: Record<ConditionAttribute, string> = {
  department: "部署",
  location: "拠点",
  position: "役職",
  employment_type: "雇用区分",
  is_management: "管理職",
  tenure_months: "入社からの期間",
};

const idList = z.array(z.uuid()).min(1, "選択肢を 1 つ以上選んでください。").max(100);

const conditionSchema = z.discriminatedUnion("attribute", [
  z.object({ attribute: z.literal("department"), operator: z.literal("in"), value: idList }),
  z.object({ attribute: z.literal("location"), operator: z.literal("in"), value: idList }),
  z.object({ attribute: z.literal("position"), operator: z.literal("in"), value: idList }),
  z.object({ attribute: z.literal("employment_type"), operator: z.literal("in"), value: idList }),
  z.object({ attribute: z.literal("is_management"), operator: z.literal("is"), value: z.boolean() }),
  z.object({
    attribute: z.literal("tenure_months"),
    operator: z.enum(["lt", "gte"]),
    value: z.number().int("期間は整数(か月)で入力してください。").min(0).max(1200),
  }),
]);

export const definitionSchema = z.object({
  groups: z
    .array(
      z.object({
        conditions: z
          .array(conditionSchema)
          .max(MAX_CONDITIONS_PER_GROUP, `1 グループの条件は ${MAX_CONDITIONS_PER_GROUP} 個までです。`),
      }),
    )
    .max(MAX_GROUPS, `グループは ${MAX_GROUPS} 個までです。`),
});

export function isAssignmentCondition(c: AudienceCondition): c is AssignmentCondition {
  return c.attribute === "department" || c.attribute === "location";
}
