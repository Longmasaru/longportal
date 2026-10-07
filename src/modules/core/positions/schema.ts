import { boolean, integer, text } from "drizzle-orm/pg-core";
import { core, idColumn, timestamps } from "../shared/schema-helpers";

/**
 * 役職マスタ(会社上の役職。属性付きのフラットなマスタ)。
 * システム上の role / permission とは無関係。役職だけで権限を自動付与しない。
 */
export const positions = core.table("positions", {
  id: idColumn(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isManagement: boolean("is_management").notNull().default(false),
  /** 序列(大きいほど上位、など運用側で決める)。 */
  rank: integer("rank").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
