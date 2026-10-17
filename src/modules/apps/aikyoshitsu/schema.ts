import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";

// AI教室アプリのテーブル(docs/DESIGN.md 28 章)。講習の回と、その資料(本体は Cloudflare R2)。
export const aikyoshitsu = pgSchema("aikyoshitsu");

const idColumn = () => uuid("id").primaryKey().defaultRandom();

/** 講習の回(第1回、第2回…)。 */
export const aiSessions = aikyoshitsu.table(
  "sessions",
  {
    id: idColumn(),
    title: text("title").notNull(),
    /** 実施日(JST の暦日)。未定なら NULL。 */
    heldOn: date("held_on", { mode: "string" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check("sessions_title_length_check", sql`char_length(${t.title}) between 1 and 100`)],
);

/** 回の資料のメタ情報(本体は Cloudflare R2。元のファイルをそのまま置く)。 */
export const aiMaterials = aikyoshitsu.table(
  "materials",
  {
    id: idColumn(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => aiSessions.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    contentType: text("content_type").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("materials_session_id_idx").on(t.sessionId, t.sortOrder)],
);

export type AiSession = typeof aiSessions.$inferSelect;
export type AiMaterial = typeof aiMaterials.$inferSelect;
