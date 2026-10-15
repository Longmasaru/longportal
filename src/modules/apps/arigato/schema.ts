import { sql } from "drizzle-orm";
import { check, date, index, pgSchema, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";
import { departments } from "@/modules/core/departments/schema";
import type { ArigatoTag, ArigatoVisibility } from "./constants";

// ありがとうカードのテーブル(docs/DESIGN.md 26 章)。
export const arigato = pgSchema("arigato");

export const arigatoCards = arigato.table(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 送った時点の、受け取った人の主所属の部署(集計用。異動しても変えない)。 */
    toDepartmentId: uuid("to_department_id").references(() => departments.id, { onDelete: "set null" }),
    tag: text("tag").$type<ArigatoTag>().notNull(),
    message: text("message").notNull(),
    visibility: text("visibility").$type<ArigatoVisibility>().notNull().default("public"),
    /** 送った日(JST の暦日)。週・月の集計に使う。 */
    sentOn: date("sent_on", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("cards_tag_check", sql`${t.tag} in ('taught', 'helped', 'challenged', 'systemized')`),
    check("cards_visibility_check", sql`${t.visibility} in ('public', 'private')`),
    check("cards_message_length_check", sql`char_length(${t.message}) between 1 and 140`),
    check("cards_not_self_check", sql`${t.fromUserId} <> ${t.toUserId}`),
    index("cards_created_at_idx").on(t.createdAt),
    index("cards_to_user_id_created_at_idx").on(t.toUserId, t.createdAt),
    index("cards_from_user_id_sent_on_idx").on(t.fromUserId, t.sentOn),
    index("cards_sent_on_idx").on(t.sentOn),
  ],
);

export const arigatoLikes = arigato.table(
  "likes",
  {
    cardId: uuid("card_id")
      .notNull()
      .references(() => arigatoCards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.userId] })],
);
