import { boolean, integer, text } from "drizzle-orm/pg-core";
import { core, idColumn, timestamps } from "../shared/schema-helpers";

/** 拠点マスタ(どこで勤務するか)。部署(departments)とは独立。 */
export const locations = core.table("locations", {
  id: idColumn(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
