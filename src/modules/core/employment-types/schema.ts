import { boolean, integer, text } from "drizzle-orm/pg-core";
import { core, idColumn, timestamps } from "../shared/schema-helpers";

/** 雇用区分マスタ。管理画面から追加でき、コード変更・migration・deploy を要さない。 */
export const employmentTypes = core.table("employment_types", {
  id: idColumn(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export type EmploymentType = typeof employmentTypes.$inferSelect;
export type NewEmploymentType = typeof employmentTypes.$inferInsert;
