import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { todoCategories, todos, type TodoPriority } from "./schema";

// TODO の読み取り。必ず user_id(本人)で絞り込む(docs/DESIGN.md 25 章)。

export type CategoryRow = { code: string; label: string; icon: string };

export type TodoRow = {
  id: string;
  text: string;
  done: boolean;
  description: string;
  priority: TodoPriority;
  /** カテゴリの code */
  category: string;
  /** `YYYY-MM-DD` または空文字 */
  dueDate: string;
};

export const FALLBACK_CATEGORY_CODE = "other";

export async function listCategories(): Promise<CategoryRow[]> {
  return db
    .select({ code: todoCategories.code, label: todoCategories.label, icon: todoCategories.icon })
    .from(todoCategories)
    .orderBy(asc(todoCategories.sortOrder));
}

const columns = {
  id: todos.id,
  text: todos.text,
  done: todos.done,
  description: todos.description,
  priority: todos.priority,
  category: todoCategories.code,
  dueDate: todos.dueDate,
};

function toRow(r: Omit<TodoRow, "dueDate"> & { dueDate: string | null }): TodoRow {
  return { ...r, dueDate: r.dueDate ?? "" };
}

/** 本人の TODO(追加順)。 */
export async function listTodos(userId: string): Promise<TodoRow[]> {
  const rows = await db
    .select(columns)
    .from(todos)
    .innerJoin(todoCategories, eq(todoCategories.id, todos.categoryId))
    .where(eq(todos.userId, userId))
    .orderBy(asc(todos.createdAt));
  return rows.map(toRow);
}

/** 本人の TODO を 1 件(本人のものでなければ null)。 */
export async function getTodo(userId: string, id: string): Promise<TodoRow | null> {
  const [row] = await db
    .select(columns)
    .from(todos)
    .innerJoin(todoCategories, eq(todoCategories.id, todos.categoryId))
    .where(and(eq(todos.userId, userId), eq(todos.id, id)));
  return row ? toRow(row) : null;
}

/** カテゴリの code → id(無い code は「その他」)。 */
export async function categoryIdOf(code: string): Promise<string> {
  const rows = await db.select({ id: todoCategories.id, code: todoCategories.code }).from(todoCategories);
  const found = rows.find((r) => r.code === code) ?? rows.find((r) => r.code === FALLBACK_CATEGORY_CODE);
  if (!found) throw new Error("TODO のカテゴリが登録されていません(migration を確認してください)。");
  return found.id;
}
