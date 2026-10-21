import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";

// TODO アプリのテーブル(docs/DESIGN.md 25 章)。データは本人(user_id)だけのもの。
export const todo = pgSchema("todo");

export const TODO_PRIORITIES = ["low", "medium", "high"] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

const idColumn = () => uuid("id").primaryKey().defaultRandom();

/** カテゴリ(初期値は migration で入れる)。自動分類の選択肢でもある。 */
export const todoCategories = todo.table("categories", {
  id: idColumn(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  icon: text("icon").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const todos = todo.table(
  "todos",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    description: text("description").notNull().default(""),
    priority: text("priority").$type<TodoPriority>().notNull().default("medium"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => todoCategories.id, { onDelete: "restrict" }),
    /** 期限(JST の暦日)。 */
    dueDate: date("due_date", { mode: "string" }),
    // ---- 依頼(docs/DESIGN.md 39 章)。requested_at が空でない行が依頼で、user_id は頼まれた人。
    /** 頼んだ日時(空 = 本人の TODO)。 */
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    /** 頼んだ人。アカウントが消えても、頼まれた人の TODO は残す。 */
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** 頼まれた人が確認した(か、何か操作した)日時。空のあいだはホームにお知らせを出す。 */
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    /** お返しした日時と、ひとこと。 */
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnedReason: text("returned_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("todos_priority_check", sql`${t.priority} in ('low', 'medium', 'high')`),
    check("todos_text_length_check", sql`char_length(${t.text}) between 1 and 200`),
    index("todos_user_id_created_at_idx").on(t.userId, t.createdAt),
    index("todos_requested_by_idx").on(t.requestedByUserId, t.requestedAt),
    check(
      "todos_request_columns_check",
      sql`${t.requestedAt} is not null or (${t.requestedByUserId} is null and ${t.acknowledgedAt} is null and ${t.returnedAt} is null and ${t.returnedReason} is null)`,
    ),
    check("todos_request_not_self_check", sql`${t.requestedByUserId} is null or ${t.requestedByUserId} <> ${t.userId}`),
    check("todos_returned_not_done_check", sql`not (${t.done} and ${t.returnedAt} is not null)`),
    check(
      "todos_returned_reason_check",
      sql`${t.returnedReason} is null or (${t.returnedAt} is not null and char_length(${t.returnedReason}) <= 200)`,
    ),
  ],
);

/** 添付ファイルのメタ情報(本体は Cloudflare R2)。 */
export const todoAttachments = todo.table(
  "attachments",
  {
    id: idColumn(),
    todoId: uuid("todo_id")
      .notNull()
      .references(() => todos.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attachments_todo_id_idx").on(t.todoId)],
);

export type Todo = typeof todos.$inferSelect;
export type TodoCategory = typeof todoCategories.$inferSelect;
