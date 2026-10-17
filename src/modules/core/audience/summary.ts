// Audience の条件を、人が読める文章にする(純粋な関数)。
import {
  ATTRIBUTE_LABEL,
  type AudienceCondition,
  type AudienceDefinition,
  type MasterListAttribute,
} from "./definition";

/**
 * マスタの ID → 名称・有効状態。無効・削除済みのマスタを参照していないかの検出にも使う。
 * employee の isActive は「いまアクセスできる社員か」(退職・入社前などは false)。
 */
export type MasterLookup = Record<
  MasterListAttribute | "employee",
  Map<string, { name: string; isActive: boolean }>
>;

export type ConditionDescription = {
  text: string;
  /** 無効、または存在しないマスタを参照している。 */
  hasStaleReference: boolean;
};

export function describeCondition(c: AudienceCondition, lookup: MasterLookup): ConditionDescription {
  switch (c.attribute) {
    case "department":
    case "location":
    case "position":
    case "employment_type":
    case "employee": {
      let stale = false;
      const names = c.value.map((id) => {
        const m = lookup[c.attribute].get(id);
        if (!m) {
          stale = true;
          return "(不明)";
        }
        if (!m.isActive) {
          stale = true;
          return `${m.name}(${c.attribute === "employee" ? "対象外" : "無効"})`;
        }
        return m.name;
      });
      return { text: `${ATTRIBUTE_LABEL[c.attribute]}: ${names.join("、")}`, hasStaleReference: stale };
    }
    case "is_management":
      return { text: c.value ? "管理職" : "管理職以外", hasStaleReference: false };
    case "tenure_months":
      return {
        text: `入社から ${c.value}か月${c.operator === "lt" ? "未満" : "以上"}`,
        hasStaleReference: false,
      };
  }
}

export type DefinitionDescription = {
  /** グループごとの文章(グループ内は「かつ」でつないである)。グループ間は「または」。 */
  groups: string[];
  hasStaleReference: boolean;
};

export function describeDefinition(def: AudienceDefinition, lookup: MasterLookup): DefinitionDescription {
  let stale = false;
  const groups = def.groups.map((g) => {
    if (g.conditions.length === 0) return "全社員(条件なし)";
    return g.conditions
      .map((c) => {
        const d = describeCondition(c, lookup);
        if (d.hasStaleReference) stale = true;
        return d.text;
      })
      .join(" かつ ");
  });
  return { groups, hasStaleReference: stale };
}
