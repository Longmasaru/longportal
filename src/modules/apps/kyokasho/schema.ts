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

export type KyokashoBookRow = typeof kyokashoBooks.$inferSelect;
