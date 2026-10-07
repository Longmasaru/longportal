import { pgSchema, timestamp, uuid } from "drizzle-orm/pg-core";

/** core モジュールの Postgres スキーマ(docs/DESIGN.md 4.1)。 */
export const core = pgSchema("core");

/** 主キー(UUID)。docs/DESIGN.md 4.2: 全テーブル UUID に統一。 */
export const idColumn = () => uuid("id").primaryKey().defaultRandom();

/** 作成・更新日時。 */
export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
