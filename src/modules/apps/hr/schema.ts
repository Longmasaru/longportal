import { sql } from "drizzle-orm";
import { check, date, index, integer, numeric, pgSchema, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";
import { employees } from "@/modules/core/employees/schema";
import type { AbilityAxis, ConditionState, Gender, RecordKind, RecordVisibility, TrainingKind } from "./labels";

/** 人事管理アプリの Postgres スキーマ(docs/DESIGN.md 4.1・31 章)。 */
export const hr = pgSchema("hr");

const employeeIdColumn = () =>
  uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "restrict" });

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * 社員ごとの記録(面談・話したこと / 指導・注意 / ほめ / 異動の理由)。人(employee)に付く業務履歴なので employee_id に紐づける。
 * 本人に見せるのは visibility = 'employee' の行だけ。読み書きの判定は logic.ts(hr.records.manage + 対象の社員の今日の所属)。
 */
export const hrRecords = hr.table(
  "records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: employeeIdColumn(),
    kind: text("kind").$type<RecordKind>().notNull(),
    /** JST の暦日(話した日・注意した日など) */
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    visibility: text("visibility").$type<RecordVisibility>().notNull().default("employee"),
    /** 書いた人。アカウントが消えても記録は残す。 */
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    check("records_kind_check", sql`${t.kind} in ('talk', 'caution', 'praise', 'transfer')`),
    check("records_visibility_check", sql`${t.visibility} in ('employee', 'managers')`),
    index("records_employee_id_occurred_on_idx").on(t.employeeId, t.occurredOn),
  ],
);

/**
 * 人事管理シートの 1〜5 章のうち、社員マスタにない項目(1 人 1 行。行がなければ未記入)。docs/DESIGN.md 31.1。
 * 4 章(人柄・適性)・5 章(コンディション)は管理する人だけに見せる。
 */
export const hrProfiles = hr.table(
  "profiles",
  {
    employeeId: uuid("employee_id")
      .primaryKey()
      .references(() => employees.id, { onDelete: "restrict" }),
    // 1. 基本情報
    birthDate: date("birth_date", { mode: "string" }),
    gender: text("gender").$type<Gender>(),
    /** 在宅勤務比率(%) */
    remoteRatio: smallint("remote_ratio"),
    // 2. 目標管理・評価
    goal: text("goal").notNull().default(""),
    midReview: text("mid_review").notNull().default(""),
    finalReview: text("final_review").notNull().default(""),
    reviewHistory: text("review_history").notNull().default(""),
    multiReview: text("multi_review").notNull().default(""),
    careerWish: text("career_wish").notNull().default(""),
    // 3. スキル・資格・経験(資格・スキル・研修は別テーブル)
    jobHistory: text("job_history").notNull().default(""),
    priorCareer: text("prior_career").notNull().default(""),
    // 4. 人柄・適性
    strengths: text("strengths").notNull().default(""),
    personality: text("personality").notNull().default(""),
    motivation: text("motivation").notNull().default(""),
    managerComment: text("manager_comment").notNull().default(""),
    // 5. コンディション(健康・メンタル・満足度は condition_checks)
    overtimeHours: numeric("overtime_hours", { precision: 5, scale: 1, mode: "number" }),
    leaveGranted: numeric("leave_granted", { precision: 4, scale: 1, mode: "number" }),
    leaveTaken: numeric("leave_taken", { precision: 4, scale: 1, mode: "number" }),
    /** 残業・有給の数字の基準日 */
    leaveAsOf: date("leave_as_of", { mode: "string" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    check("profiles_gender_check", sql`${t.gender} is null or ${t.gender} in ('male', 'female', 'other')`),
    check("profiles_remote_ratio_check", sql`${t.remoteRatio} is null or ${t.remoteRatio} between 0 and 100`),
    check("profiles_overtime_check", sql`${t.overtimeHours} is null or ${t.overtimeHours} >= 0`),
    check(
      "profiles_leave_check",
      sql`(${t.leaveGranted} is null or ${t.leaveGranted} >= 0) and (${t.leaveTaken} is null or ${t.leaveTaken} >= 0)`,
    ),
  ],
);

/** 保有資格・免許(3 章)。 */
export const hrQualifications = hr.table(
  "qualifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: employeeIdColumn(),
    name: text("name").notNull(),
    acquiredOn: date("acquired_on", { mode: "string" }),
    expiresOn: date("expires_on", { mode: "string" }),
    ...timestamps(),
  },
  (t) => [index("qualifications_employee_id_idx").on(t.employeeId)],
);

/** 保有スキル・専門技術と評価 1〜5(3 章)。 */
export const hrSkills = hr.table(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: employeeIdColumn(),
    name: text("name").notNull(),
    level: integer("level").notNull(),
    ...timestamps(),
  },
  (t) => [
    check("skills_level_check", sql`${t.level} between 1 and 5`),
    index("skills_employee_id_idx").on(t.employeeId),
  ],
);

/** 受講済の研修(3 章)。 */
export const hrTrainings = hr.table(
  "trainings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: employeeIdColumn(),
    kind: text("kind").$type<TrainingKind>().notNull(),
    title: text("title").notNull(),
    takenOn: date("taken_on", { mode: "string" }),
    ...timestamps(),
  },
  (t) => [
    check("trainings_kind_check", sql`${t.kind} in ('internal', 'external')`),
    index("trainings_employee_id_idx").on(t.employeeId),
  ],
);

/** 健康状態・メンタル面・満足度の確認(5 章)。直近 2 回を「前回 / 今回」として並べる。 */
export const hrConditionChecks = hr.table(
  "condition_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: employeeIdColumn(),
    checkedOn: date("checked_on", { mode: "string" }).notNull(),
    health: text("health").$type<ConditionState>(),
    mental: text("mental").$type<ConditionState>(),
    /** 5 = 大変満足 … 1 = 大変不満 */
    satisfaction: smallint("satisfaction"),
    note: text("note").notNull().default(""),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    check("condition_checks_health_check", sql`${t.health} is null or ${t.health} in ('good', 'same', 'poor')`),
    check("condition_checks_mental_check", sql`${t.mental} is null or ${t.mental} in ('good', 'same', 'poor')`),
    check("condition_checks_satisfaction_check", sql`${t.satisfaction} is null or ${t.satisfaction} between 1 and 5`),
    index("condition_checks_employee_id_checked_on_idx").on(t.employeeId, t.checkedOn),
  ],
);

/**
 * 能力の 5 項目の評価(全社共通の軸 ABILITY_AXES。1 人 1 軸 1 行。31.2)。
 * 軸を足せるよう axis に CHECK 制約は付けない(Server Action で検証する)。
 */
export const hrAbilities = hr.table(
  "abilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: employeeIdColumn(),
    axis: text("axis").$type<AbilityAxis>().notNull(),
    level: smallint("level").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    check("abilities_level_check", sql`${t.level} between 1 and 5`),
    uniqueIndex("abilities_employee_id_axis_idx").on(t.employeeId, t.axis),
  ],
);

export type HrRecordRow = typeof hrRecords.$inferSelect;
export type HrProfileRow = typeof hrProfiles.$inferSelect;
