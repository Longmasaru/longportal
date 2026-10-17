import {
  boolean,
  check,
  index,
  integer,
  primaryKey,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { audiences } from "@/modules/core/audience/schema";
import { users } from "@/modules/core/auth/schema";
import type { BookContent } from "./content";

/** ロングの教科書アプリの Postgres スキーマ(docs/DESIGN.md 30 章)。 */
export const kyokasho = pgSchema("kyokasho");

/**
 * 教科書(部署の初級編、機械ごとの単元など)。中身は Google ドキュメントから取り込んだもの(content)。
 * 見られる人は target(company = 全員 / audience = Audience に当てはまる人)。最初は非公開(is_published = false)。
 */
export const kyokashoBooks = kyokasho.table(
  "books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** URL に使う名前(半角の小文字・数字・-。例 brake-basic)。 */
    slug: varchar("slug", { length: 60 }).notNull(),
    /** 一覧のまとまり(部署名など。例 ブレーキ部、全部署共通)。 */
    department: varchar("department", { length: 40 }).notNull(),
    title: varchar("title", { length: 80 }).notNull(),
    description: varchar("description", { length: 300 }).notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    target: varchar("target", { length: 20 }).notNull().default("company"),
    audienceId: uuid("audience_id").references(() => audiences.id, { onDelete: "restrict" }),
    isPublished: boolean("is_published").notNull().default(false),
    /** 元の Google ドキュメントの URL(編集する人が開けるように)。 */
    sourceUrl: text("source_url").notNull().default(""),
    content: jsonb("content").$type<BookContent>().notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    importedBy: uuid("imported_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("books_slug_key").on(t.slug),
    check("books_target_check", sql`${t.target} IN ('company', 'audience')`),
    check(
      "books_audience_check",
      sql`(${t.target} = 'audience') = (${t.audienceId} IS NOT NULL)`,
    ),
  ],
);

/** 教科書の画像(Cloudflare R2 に保存。中身からは id で参照する)。 */
export const kyokashoImages = kyokasho.table(
  "images",
  {
    id: uuid("id").primaryKey(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => kyokashoBooks.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    contentType: varchar("content_type", { length: 40 }).notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("images_book_id_idx").on(t.bookId)],
);

/**
 * ツッコミ(読んだ人の疑問・付け足し・まちがいの指摘・ひとこと)。docs/DESIGN.md 32 章。
 * 章は番号で指すので、取り込み直しで章がずれても読めるよう、章と節の題名を書いた時点の写しで持つ。
 * 教科書チームが受け止め方(status)と返事(reply)を書く。正本は Google ドキュメントのままで、採用したら元の文書を直して取り込み直し、「反映済み」にする。
 */
export const kyokashoComments = kyokasho.table(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => kyokashoBooks.id, { onDelete: "cascade" }),
    chapterNo: integer("chapter_no").notNull(),
    chapterTitle: varchar("chapter_title", { length: 200 }).notNull(),
    /** 節の見出しの id(章全体へのツッコミは null)。 */
    sectionId: varchar("section_id", { length: 80 }),
    sectionTitle: varchar("section_title", { length: 200 }).notNull().default(""),
    kind: varchar("kind", { length: 20 }).notNull(),
    body: text("body").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    /** 教科書チームからの返事(お礼・答え・直し方)。 */
    reply: text("reply").notNull().default(""),
    repliedBy: uuid("replied_by").references(() => users.id, { onDelete: "set null" }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("comments_book_chapter_idx").on(t.bookId, t.chapterNo),
    index("comments_status_idx").on(t.status),
    index("comments_author_idx").on(t.authorUserId),
    check("comments_kind_check", sql`${t.kind} IN ('question', 'addition', 'mistake', 'comment')`),
    check("comments_status_check", sql`${t.status} IN ('open', 'adopted', 'reflected', 'kept')`),
    check("comments_body_check", sql`char_length(${t.body}) BETWEEN 1 AND 1000`),
    check("comments_chapter_check", sql`${t.chapterNo} >= 1`),
  ],
);

/** ツッコミへの「ありがとう」(読んだ人が、ほかの人のツッコミに送る。1 人 1 回)。 */
export const kyokashoCommentThanks = kyokasho.table(
  "comment_thanks",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => kyokashoComments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);

export type KyokashoBookRow = typeof kyokashoBooks.$inferSelect;
