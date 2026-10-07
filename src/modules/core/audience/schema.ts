import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { employees } from "../employees/schema";
import { core, idColumn, timestamps } from "../shared/schema-helpers";

/**
 * Audience(対象者の条件)。名前を付けて保存し、お知らせ・アプリ・リンクなどで再利用する。
 * 社員 ID の一覧は保存せず、条件(groups / conditions)を保存して、見るたびに現在の社員マスタに対して評価する。
 * グループが 0 個の Audience は誰も対象にしない(deny by default)。
 */
export const audiences = core.table("audiences", {
  id: idColumn(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  /** 無効な Audience は、誰も対象にしない。 */
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

/** グループ間は OR。 */
export const audienceGroups = core.table(
  "audience_groups",
  {
    id: idColumn(),
    audienceId: uuid("audience_id")
      .notNull()
      .references(() => audiences.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("audience_groups_audience_id_idx").on(t.audienceId)],
);

/**
 * グループ内の条件(AND)。value はマスタの ID の配列・真偽値・数値(attribute ごとに型が決まる)。
 * 検証は definition.ts の zod スキーマで行う。
 */
export const audienceConditions = core.table(
  "audience_conditions",
  {
    id: idColumn(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => audienceGroups.id, { onDelete: "cascade" }),
    attribute: text("attribute").notNull(),
    operator: text("operator").notNull(),
    value: jsonb("value").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("audience_conditions_group_id_idx").on(t.groupId),
    check(
      "audience_conditions_attribute_check",
      sql`${t.attribute} in ('department', 'location', 'position', 'employment_type', 'is_management', 'tenure_months')`,
    ),
    check("audience_conditions_operator_check", sql`${t.operator} in ('in', 'is', 'lt', 'gte')`),
  ],
);

/**
 * 個人の追加(include)・除外(exclude)。将来用の構造で、MVP では使わない(評価にも画面にも反映しない)。
 */
export const audienceMembers = core.table(
  "audience_members",
  {
    audienceId: uuid("audience_id")
      .notNull()
      .references(() => audiences.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.audienceId, t.employeeId] }),
    check("audience_members_kind_check", sql`${t.kind} in ('include', 'exclude')`),
  ],
);

export type Audience = typeof audiences.$inferSelect;
