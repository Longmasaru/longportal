import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";
import { departments } from "@/modules/core/departments/schema";
import { locations } from "@/modules/core/locations/schema";
import type { AiReview, PhotoKind, ReactionKind, ZukanChapter, ZukanStatus } from "./constants";

// カイゼン図鑑のテーブル(docs/DESIGN.md 44 章)。
export const zukan = pgSchema("zukan");

export const zukanEntries = zukan.table(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 保存した時点の、投稿者の主所属(部署・拠点の図鑑の絞り込み用。異動しても変えない)。 */
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    /** 図鑑番号。登録(公開)した順に 1, 2, 3…。発見待ちは null。削除しても詰めない。 */
    number: integer("number"),
    status: text("status").$type<ZukanStatus>().notNull(),
    title: text("title").notNull().default(""),
    chapter: text("chapter").$type<ZukanChapter>(),
    what: text("what").notNull().default(""),
    effect: text("effect").notNull().default(""),
    place: text("place").notNull().default(""),
    /** 保存した日(JST の暦日)。1 日の上限の判定に使う。 */
    postedOn: date("posted_on", { mode: "string" }).notNull(),
    /** AI の下見(鑑定する人だけが見る)。失敗・未実施なら null。 */
    aiReview: jsonb("ai_review").$type<AiReview>(),
    /** 確定した 4 観点(各 1〜5)と、100 点満点の点数。未鑑定は null。 */
    scoreEffect: smallint("score_effect"),
    scoreIdea: smallint("score_idea"),
    scoreReuse: smallint("score_reuse"),
    scoreSustain: smallint("score_sustain"),
    score: smallint("score"),
    appraisedByUserId: uuid("appraised_by_user_id").references(() => users.id, { onDelete: "set null" }),
    appraisalComment: text("appraisal_comment").notNull().default(""),
    appraisedAt: timestamp("appraised_at", { withTimezone: true }),
    /** 本人が鑑定の結果(レア度が開く演出)を見た日時。 */
    revealSeenAt: timestamp("reveal_seen_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("entries_status_check", sql`${t.status} in ('draft', 'published')`),
    check(
      "entries_chapter_check",
      sql`${t.chapter} is null or ${t.chapter} in ('jitan', 'anzen', 'hinshitsu', 'katazuke', 'cost', 'raku', 'other')`,
    ),
    // 登録済みなら番号・名前・章がある。発見待ちには番号がない。
    check(
      "entries_published_check",
      sql`(${t.status} = 'draft' and ${t.number} is null) or (${t.status} = 'published' and ${t.number} is not null and ${t.chapter} is not null and ${t.title} <> '')`,
    ),
    check("entries_title_length_check", sql`char_length(${t.title}) <= 30`),
    check("entries_what_length_check", sql`char_length(${t.what}) <= 500`),
    check("entries_effect_length_check", sql`char_length(${t.effect}) <= 200`),
    check("entries_place_length_check", sql`char_length(${t.place}) <= 100`),
    check("entries_appraisal_comment_length_check", sql`char_length(${t.appraisalComment}) <= 200`),
    check(
      "entries_scores_check",
      sql`(${t.score} is null and ${t.scoreEffect} is null and ${t.scoreIdea} is null and ${t.scoreReuse} is null and ${t.scoreSustain} is null)
        or (${t.score} between 0 and 100 and ${t.scoreEffect} between 1 and 5 and ${t.scoreIdea} between 1 and 5 and ${t.scoreReuse} between 1 and 5 and ${t.scoreSustain} between 1 and 5)`,
    ),
    uniqueIndex("entries_number_unique").on(t.number),
    index("entries_author_user_id_idx").on(t.authorUserId, t.createdAt),
    index("entries_status_published_at_idx").on(t.status, t.publishedAt),
  ],
);

/** ページの写真(R2 に保存。キーは `<プレフィックス>zukan/<投稿者の user id>/<UUID>.<拡張子>`)。 */
export const zukanPhotos = zukan.table(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => zukanEntries.id, { onDelete: "cascade" }),
    kind: text("kind").$type<PhotoKind>().notNull(),
    storageKey: text("storage_key").notNull().unique("photos_storage_key_unique"),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("photos_kind_check", sql`${t.kind} in ('before', 'after')`),
    index("photos_entry_id_idx").on(t.entryId),
  ],
);

/** 「なるほど!」「まねしたい!」(1 人 1 種類 1 回)。 */
export const zukanReactions = zukan.table(
  "reactions",
  {
    entryId: uuid("entry_id")
      .notNull()
      .references(() => zukanEntries.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ReactionKind>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "reactions_pkey", columns: [t.entryId, t.userId, t.kind] }),
    check("reactions_kind_check", sql`${t.kind} in ('naruhodo', 'maneshitai')`),
  ],
);

/** ページへのひとことのコメント。 */
export const zukanComments = zukan.table(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => zukanEntries.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("comments_body_length_check", sql`char_length(${t.body}) between 1 and 300`),
    index("comments_entry_id_created_at_idx").on(t.entryId, t.createdAt),
  ],
);
