import {
  boolean,
  index,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../auth/schema";
import { departments } from "../departments/schema";
import { locations } from "../locations/schema";
import { core, idColumn, timestamps } from "../shared/schema-helpers";

/**
 * ロール(何ができるか)。全社共通。どこでできるか(スコープ)は割当(role_assignments)側で指定する。
 * 役職(positions)とは無関係で、役職だけで権限を自動付与しない。
 */
export const roles = core.table("roles", {
  id: idColumn(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** システムが用意したロール(削除できない)。 */
  isSystem: boolean("is_system").notNull().default(false),
  /** 保護対象(system_admin)。削除・名称変更・権限の剥奪を拒否する。 */
  isProtected: boolean("is_protected").notNull().default(false),
  ...timestamps(),
});

/**
 * 権限(permission)。code はコード側(core の catalog / 各アプリの manifest)で定義し、
 * sync で DB に反映する。管理画面からは作成・変更できない(typo や実装との不整合を防ぐため)。
 */
export const permissions = core.table("permissions", {
  id: idColumn(),
  /** 例: core.employees.manage / education.view */
  code: text("code").notNull().unique(),
  /** 所属するアプリ。core の権限は NULL。 */
  appKey: text("app_key"),
  description: text("description").notNull(),
  ...timestamps(),
});

export const rolePermissions = core.table(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

/**
 * ロール割当(スコープ付き)。location_id・department_id がどちらも NULL なら全社(global)、
 * 片方だけならその拠点・部署、両方あれば「拠点 AND 部署」。
 * 同じ組み合わせの重複は NULL も同じ値として扱って禁止する(NULLS NOT DISTINCT)。
 */
export const roleAssignments = core.table(
  "role_assignments",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "restrict" }),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "restrict" }),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("role_assignments_unique_scope")
      .on(t.userId, t.roleId, t.locationId, t.departmentId)
      .nullsNotDistinct(),
    index("role_assignments_user_id_idx").on(t.userId),
    index("role_assignments_role_id_idx").on(t.roleId),
  ],
);

export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type RoleAssignment = typeof roleAssignments.$inferSelect;
