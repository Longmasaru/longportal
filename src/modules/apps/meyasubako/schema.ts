import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";
import { departments } from "@/modules/core/departments/schema";
import { locations } from "@/modules/core/locations/schema";
import type { MeyasubakoCategory, MeyasubakoDestination, MeyasubakoStatus, MeyasubakoVisibility } from "./constants";

// 目安箱のテーブル(docs/DESIGN.md 42 章)。
export const meyasubako = pgSchema("meyasubako");

export const meyasubakoPosts = meyasubako.table(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 投稿者。匿名の投稿でも持つ(本人の「わたしの投稿」と返事の受け取りに使う。画面には出さない)。 */
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 投稿した時点の、投稿者の主所属(リーダー宛ての範囲の判定用。異動しても変えない)。 */
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    category: text("category").$type<MeyasubakoCategory>().notNull(),
    destination: text("destination").$type<MeyasubakoDestination>().notNull().default("company"),
    visibility: text("visibility").$type<MeyasubakoVisibility>().notNull(),
    anonymous: boolean("anonymous").notNull().default(false),
    place: text("place").notNull().default(""),
    body: text("body").notNull().default(""),
    status: text("status").$type<MeyasubakoStatus>().notNull().default("new"),
    /** 投稿した日(JST の暦日)。1 日の上限の判定に使う。 */
    postedOn: date("posted_on", { mode: "string" }).notNull(),
    /** 投稿者が最後に書き足した日時(返事をする側の要対応の判定)。 */
    authorActivityAt: timestamp("author_activity_at", { withTimezone: true }),
    /** 返事をする側が最後にこの投稿を開いた日時(返事をする人どうしで共有する)。 */
    responderReadAt: timestamp("responder_read_at", { withTimezone: true }),
    /** 返事・状況の変更の最後の日時(投稿者の未読の判定)。 */
    responderActivityAt: timestamp("responder_activity_at", { withTimezone: true }),
    /** 投稿者が最後にこの投稿を開いた日時。 */
    authorReadAt: timestamp("author_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "posts_category_check",
      sql`${t.category} in ('request', 'hazard', 'consult', 'idea', 'want', 'thanks', 'other')`,
    ),
    check("posts_destination_check", sql`${t.destination} in ('company', 'leader')`),
    check("posts_visibility_check", sql`${t.visibility} in ('public', 'private')`),
    check("posts_status_check", sql`${t.status} in ('new', 'seen', 'doing', 'done')`),
    check("posts_body_length_check", sql`char_length(${t.body}) <= 2000`),
    check("posts_place_length_check", sql`char_length(${t.place}) <= 100`),
    index("posts_author_user_id_idx").on(t.authorUserId, t.createdAt),
    index("posts_created_at_idx").on(t.createdAt),
    index("posts_visibility_created_at_idx").on(t.visibility, t.createdAt),
  ],
);

/** 投稿に付けた写真(R2 に保存。キーは `<プレフィックス>meyasubako/<投稿者の user id>/<UUID>.<拡張子>`)。 */
export const meyasubakoPhotos = meyasubako.table(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => meyasubakoPosts.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique("photos_storage_key_unique"),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("photos_post_id_idx").on(t.postId)],
);

/** 投稿へのやり取り(返事と、投稿者の書き足し)。 */
export const meyasubakoMessages = meyasubako.table(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => meyasubakoPosts.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    /** true = 返事をする側(管理する人・リーダー)が書いた。false = 投稿者の書き足し。 */
    fromResponder: boolean("from_responder").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("messages_body_length_check", sql`char_length(${t.body}) between 1 and 1000`),
    index("messages_post_id_created_at_idx").on(t.postId, t.createdAt),
  ],
);
