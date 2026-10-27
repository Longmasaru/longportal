import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";
import type { ExamContent } from "./content";

/** 技能検定の練習アプリの Postgres スキーマ(docs/DESIGN.md 44 章)。 */
export const kentei = pgSchema("kentei");

/**
 * 試験(職種・作業・級ごと。例 工場板金(機械板金作業)基礎級)。中身は取り込んだ JSON(content)。
 * 最初は非公開(is_published = false)。非公開の試験は kentei.exams.manage を持つ人だけが確かめられる。
 */
export const kenteiExams = kentei.table(
  "exams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** URL に使う名前(半角の小文字・数字・-。例 kouban-kikai-kiso)。 */
    slug: varchar("slug", { length: 60 }).notNull(),
    /** 職種・作業(例 工場板金(機械板金作業))。 */
    title: varchar("title", { length: 80 }).notNull(),
    /** 級(例 基礎級)。 */
    grade: varchar("grade", { length: 20 }).notNull(),
    titleVi: varchar("title_vi", { length: 160 }).notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    content: jsonb("content").$type<ExamContent>().notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    importedBy: uuid("imported_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("exams_slug_key").on(t.slug)],
);

/** 問題の図・実技の製作図。ファイルは R2(非公開)、表示は /apps/kentei/images/<id> から署名付き URL へ転送する。 */
export const kenteiImages = kentei.table(
  "images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => kenteiExams.id, { onDelete: "cascade" }),
    /** 取り込んだときのファイル名(取り込み直しで同じ画像を使い回す)。 */
    name: varchar("name", { length: 200 }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: varchar("content_type", { length: 40 }).notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("images_exam_id_idx").on(t.examId)],
);

/**
 * 学習モードで 1 問答えるごとの記録(本人のもの)。おぼえたか・間違えた問題は、ここから求める。
 * 問題の id は中身(content)の中の id。取り込み直しで問題が消えても、記録は残す(画面では使わない)。
 */
export const kenteiAnswers = kentei.table(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    examId: uuid("exam_id")
      .notNull()
      .references(() => kenteiExams.id, { onDelete: "cascade" }),
    questionId: varchar("question_id", { length: 60 }).notNull(),
    /** study = 学習モード、test = 模擬テスト。 */
    mode: varchar("mode", { length: 10 }).notNull(),
    correct: boolean("correct").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("answers_user_exam_idx").on(t.userId, t.examId, t.answeredAt),
    check("answers_mode_check", sql`${t.mode} in ('study', 'test')`),
  ],
);

/** 模擬テストの結果(本人のもの)。 */
export const kenteiTestResults = kentei.table(
  "test_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    examId: uuid("exam_id")
      .notNull()
      .references(() => kenteiExams.id, { onDelete: "cascade" }),
    /** random = ランダム出題、past = 過去問 1 回分。 */
    kind: varchar("kind", { length: 10 }).notNull(),
    /** 過去問の回(kind = past のとき)。 */
    round: integer("round"),
    correct: integer("correct").notNull(),
    total: integer("total").notNull(),
    /** 100 点満点の点数(正答数 × 100 ÷ 問題数、四捨五入)。 */
    score: integer("score").notNull(),
    passed: boolean("passed").notNull(),
    /** かかった秒数。 */
    seconds: integer("seconds").notNull(),
    /** 出した問題と答え([{ q: 問題の id, a: true / false / null }])。 */
    detail: jsonb("detail").$type<{ q: string; a: boolean | null }[]>().notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("test_results_user_exam_idx").on(t.userId, t.examId, t.takenAt),
    check("test_results_kind_check", sql`${t.kind} in ('random', 'past')`),
    check("test_results_round_check", sql`(${t.kind} = 'past') = (${t.round} is not null)`),
  ],
);

export type KenteiExamRow = typeof kenteiExams.$inferSelect;
