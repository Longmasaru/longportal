import { doublePrecision, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";
import { employees } from "@/modules/core/employees/schema";
import type { AreaKey } from "./floor-map";

// 組織図アプリのテーブル(docs/DESIGN.md 36 章)。
export const soshikizu = pgSchema("soshikizu");

/**
 * 配置図で、管理者が札を動かした人の「よくいる場所」。行がない人は、コード(floor-map.ts)の場所のまま。
 * 座標は配置図の mm(floor-map.ts と同じ)。1 人 1 か所。
 */
export const soshikizuSeatPositions = soshikizu.table("seat_positions", {
  employeeId: uuid("employee_id")
    .primaryKey()
    .references(() => employees.id, { onDelete: "cascade" }),
  area: text("area").$type<AreaKey>().notNull(),
  x: doublePrecision("x").notNull(),
  y: doublePrecision("y").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type SeatPositionRow = typeof soshikizuSeatPositions.$inferSelect;
