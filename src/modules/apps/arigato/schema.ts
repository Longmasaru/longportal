import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgSchema, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";
import { departments } from "@/modules/core/departments/schema";
import type { Rank, Side } from "./banzuke";
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

/** 四股名(ユーザーごとに 1 件。全社で重複しない)。 */
export const arigatoShikona = arigato.table(
  "shikona",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().unique("shikona_name_unique"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("shikona_name_length_check", sql`char_length(${t.name}) between 1 and 12`)],
);

/**
 * 番付(場所 × ユーザー)。場所が変わって最初に画面が開かれたときに作る(docs/DESIGN.md 26 章)。
 * wins・received・yusho は、その場所が終わって次の番付を作るときに書き込む。
 */
export const arigatoBanzuke = arigato.table(
  "banzuke",
  {
    /** 場所の最初の月(`YYYY-MM`)。 */
    basho: text("basho").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    rank: text("rank").$type<Rank>().notNull(),
    side: text("side").$type<Side>().notNull(),
    /** この場所で新しく大関・横綱に上がった(伝達式の対象)。 */
    promoted: boolean("promoted").notNull().default(false),
    /** 伝達式で選んだ四字熟語。 */
    kojoWord: text("kojo_word"),
    wins: integer("wins"),
    received: integer("received"),
    yusho: boolean("yusho").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.basho, t.userId] }),
    check("banzuke_basho_check", sql`${t.basho} ~ '^[0-9]{4}-(01|03|05|07|09|11)$'`),
    check(
      "banzuke_rank_check",
      sql`${t.rank} in ('yokozuna', 'ozeki', 'sekiwake', 'komusubi', 'maegashira', 'juryo', 'makushita', 'jonokuchi', 'maezumo')`,
    ),
    check("banzuke_side_check", sql`${t.side} in ('east', 'west')`),
    index("banzuke_user_id_idx").on(t.userId),
  ],
);
