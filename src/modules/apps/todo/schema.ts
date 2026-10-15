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
