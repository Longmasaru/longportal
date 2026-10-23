import { sql } from "drizzle-orm";
import { check, date, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";
import { employees } from "@/modules/core/employees/schema";
import type { ResidenceStatus } from "./constants";

// ベトナムの仲間(名簿)のテーブル(docs/DESIGN.md 43 章)。
export const nakama = pgSchema("nakama");

/**
 * 名簿に載せる社員(1 人 1 行。行がある在籍者だけが名簿に出る)。氏名・フリガナ・所属・入社日は社員マスタのものを使い、ここには持たない。
 * 顔写真は LINE WORKS のアイコン(ポータルには保存しない)。
 */
export const nakamaMembers = nakama.table(
  "members",
  {
    employeeId: uuid("employee_id")
      .primaryKey()
      .references(() => employees.id, { onDelete: "restrict" }),
    /** ベトナム語の名前(例: Nguyễn Văn An)。 */
    nativeName: text("native_name").notNull().default(""),
    /** 職場での呼び名(例: アン)。札にいちばん大きく出す。 */
    nickname: text("nickname").notNull().default(""),
    /** 日本に来た日(「日本に来て ○年目」の計算に使う)。 */
    arrivedOn: date("arrived_on", { mode: "string" }),
    hometown: text("hometown").notNull().default(""),
    /** ひとこと(趣味・好きなものなど)。 */
    note: text("note").notNull().default(""),
    /** 在留資格(札・印刷に出す)と在留期限(管理の画面だけ。期限が近い人を知らせる)。どちらも任意。在留カードの番号は持たない。 */
    residenceStatus: text("residence_status").$type<ResidenceStatus>(),
    residenceExpiresOn: date("residence_expires_on", { mode: "string" }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "members_residence_status_check",
      sql`${t.residenceStatus} is null or ${t.residenceStatus} in ('technical_intern_1', 'technical_intern_2', 'technical_intern_3', 'employment_training', 'specified_skilled_1', 'specified_skilled_2', 'engineer', 'permanent', 'family', 'other')`,
    ),
    check("members_native_name_length_check", sql`char_length(${t.nativeName}) <= 100`),
    check("members_nickname_length_check", sql`char_length(${t.nickname}) <= 30`),
    check("members_hometown_length_check", sql`char_length(${t.hometown}) <= 50`),
    check("members_note_length_check", sql`char_length(${t.note}) <= 100`),
  ],
);
