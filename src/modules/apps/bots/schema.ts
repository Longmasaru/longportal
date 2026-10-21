import { sql } from "drizzle-orm";
import { boolean, check, date, index, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";

// LINE WORKS の Bot のテーブル(docs/DESIGN.md 38 章)。種類(kind)ごとの中身はコード(kinds.ts)が持つ。
export const bots = pgSchema("bots");

export const BOT_KINDS = ["rain", "notice"] as const;
export type BotKind = (typeof BOT_KINDS)[number];

export const BOT_RUN_STATUSES = ["running", "sent", "skipped", "failed"] as const;
export type BotRunStatus = (typeof BOT_RUN_STATUSES)[number];

/** Bot(何を・どのトークルームに送るか)。設定(settings)の形は種類ごとに kinds.ts の zod で確かめる。 */
export const botsBots = bots.table(
  "bots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind").$type<BotKind>().notNull(),
    /** 送り先のトークルーム(npm run lineworks:setup で作って表示された channelId)。 */
    channelId: text("channel_id").notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("bots_kind_check", sql`${t.kind} in ('rain', 'notice')`),
    check("bots_name_length_check", sql`char_length(${t.name}) between 1 and 60`),
  ],
);

/** 定時の実行の記録。同じ Bot は 1 日 1 回だけ(先に行を入れて、入れられたときだけ送る)。 */
export const botsRuns = bots.table(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => botsBots.id, { onDelete: "cascade" }),
    /** 実行した日(JST の暦日)。 */
    runDate: date("run_date", { mode: "string" }).notNull(),
    status: text("status").$type<BotRunStatus>().notNull(),
    /** 送った本文、送らなかった理由、またはエラー。 */
    message: text("message").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("runs_status_check", sql`${t.status} in ('running', 'sent', 'skipped', 'failed')`),
    uniqueIndex("runs_bot_id_run_date_idx").on(t.botId, t.runDate),
    index("runs_run_date_idx").on(t.runDate),
  ],
);

export type Bot = typeof botsBots.$inferSelect;
export type BotRun = typeof botsRuns.$inferSelect;
