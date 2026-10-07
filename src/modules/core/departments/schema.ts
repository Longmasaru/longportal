import { boolean, integer, text } from "drizzle-orm/pg-core";
import { core, idColumn, timestamps } from "../shared/schema-helpers";

/** 部署マスタ(何の仕事・機能を担当するか)。フラット。拠点(locations)とは独立。 */
export const departments = core.table("departments", {
  id: idColumn(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
