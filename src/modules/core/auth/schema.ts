import { sql } from "drizzle-orm";
import { boolean, check, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { employees } from "../employees/schema";
import { core, idColumn, timestamps } from "../shared/schema-helpers";

/** システム利用可否。社員の人事上の状態(employees.status)とは別。 */
export const USER_STATUSES = ["active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * ポータルへログインする認証アカウント。
 * employee と 1 対 0..1(employee_id は UNIQUE・NULL 可)。社員以外の user も作れる。
 */
export const users = core.table(
  "users",
  {
    id: idColumn(),
    /** ログイン ID。常に小文字で保存する(CHECK 制約で担保)。 */
    loginId: text("login_id").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    employeeId: uuid("employee_id")
      .unique()
      .references(() => employees.id, { onDelete: "restrict" }),
    status: text("status").$type<UserStatus>().notNull().default("active"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    check("users_status_check", sql`${t.status} in ('active', 'disabled')`),
    check("users_login_id_lowercase", sql`${t.loginId} = lower(${t.loginId})`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
