import { sql } from "drizzle-orm";
import { boolean, check, date, index, text, uuid } from "drizzle-orm/pg-core";
import { departments } from "../departments/schema";
import { employmentTypes } from "../employment-types/schema";
import { locations } from "../locations/schema";
import { positions } from "../positions/schema";
import { core, idColumn, timestamps } from "../shared/schema-helpers";

/** 社員の人事上の状態。システム利用可否(users.status)とは別。 */
export const EMPLOYEE_STATUSES = ["planned", "active", "leave", "retired"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

/**
 * 社員(会社として管理する人材)。user(ログインアカウント)がなくても存在できる。
 * 部署・拠点は持たない(所属は employee_assignments を正とする)。
 * 日付は JST の暦日として扱うため、string(YYYY-MM-DD)モードで持つ。
 */
export const employees = core.table(
  "employees",
  {
    id: idColumn(),
    /** 人が扱う業務上の識別子。UUID(id)とは別物。 */
    employeeNumber: text("employee_number").notNull().unique(),
    /** 姓(必須)・名。外国籍の方は、ミドルネームまでを姓に含める(docs/DESIGN.md 22 章)。 */
    familyName: text("family_name").notNull(),
    givenName: text("given_name"),
    familyNameKana: text("family_name_kana"),
    givenNameKana: text("given_name_kana"),
    /**
     * 表示用の氏名(生成列。書き込まない)。英字だけなら半角空白、それ以外は全角空白でつなぐ。
     * 規則は names.ts の joinName / joinNameKana と同じ。
     */
    name: text("name")
      .notNull()
      .generatedAlwaysAs(
        sql`family_name || case when given_name is null or given_name = '' then '' when (family_name || given_name) ~ '^[ -~]*$' then ' ' || given_name else '　' || given_name end`,
      ),
    nameKana: text("name_kana").generatedAlwaysAs(
      sql`case when coalesce(family_name_kana, '') = '' and coalesce(given_name_kana, '') = '' then null when coalesce(family_name_kana, '') = '' then given_name_kana when coalesce(given_name_kana, '') = '' then family_name_kana when family_name_kana like '%・%' then family_name_kana || '・' || given_name_kana else family_name_kana || '　' || given_name_kana end`,
    ),
    employmentTypeId: uuid("employment_type_id")
      .notNull()
      .references(() => employmentTypes.id, { onDelete: "restrict" }),
    /** 役職なしの社員もいるため NULL 可。 */
    positionId: uuid("position_id").references(() => positions.id, { onDelete: "restrict" }),
    hiredOn: date("hired_on", { mode: "string" }).notNull(),
    /** 生年月日(任意)。会社カレンダーの誕生日・人事管理の年齢に使う。docs/DESIGN.md 37 章。 */
    birthDate: date("birth_date", { mode: "string" }),
    /** 最終在籍日(この日までは利用可、翌日から deny)。 */
    leftOn: date("left_on", { mode: "string" }),
    status: text("status").$type<EmployeeStatus>().notNull().default("planned"),
    ...timestamps(),
  },
  (t) => [
    check(
      "employees_status_check",
      sql`${t.status} in ('planned', 'active', 'leave', 'retired')`,
    ),
    // retired なら left_on 必須(left_on だけでは retired を必須にしない: 退職予定日を先に登録できる)。
    check("employees_retired_requires_left_on", sql`${t.status} <> 'retired' or ${t.leftOn} is not null`),
    check("employees_left_on_after_hired_on", sql`${t.leftOn} is null or ${t.leftOn} >= ${t.hiredOn}`),
    index("employees_employment_type_id_idx").on(t.employmentTypeId),
    index("employees_position_id_idx").on(t.positionId),
    index("employees_status_idx").on(t.status),
  ],
);

/**
 * 所属(異動履歴)。部署と拠点の組を期間付きで持つ。
 * - 基準日に有効: start_date <= 基準日 AND (end_date IS NULL OR end_date >= 基準日)。end_date は最終日を含む。
 * - 主所属(is_primary)同士の期間重複は、DB の排他制約で禁止する(migration の手書き SQL。
 *   Drizzle のスキーマ定義では表現できない)。副所属は重複可能。
 */
export const employeeAssignments = core.table(
  "employee_assignments",
  {
    id: idColumn(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    isPrimary: boolean("is_primary").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    check("employee_assignments_period_check", sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
    index("employee_assignments_employee_id_start_date_idx").on(t.employeeId, t.startDate),
    index("employee_assignments_department_id_idx").on(t.departmentId),
    index("employee_assignments_location_id_idx").on(t.locationId),
  ],
);

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type EmployeeAssignment = typeof employeeAssignments.$inferSelect;
export type NewEmployeeAssignment = typeof employeeAssignments.$inferInsert;
