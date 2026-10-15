"use server";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAppAccess } from "@/modules/core/apps";
import {
  createDownloadUrl,
  createUploadUrl,
  currentKeyPrefix,
  deleteObject,
  headObject,
  uploadRequestSchema,
} from "@/modules/core/storage";
import { classifyCategory } from "./classify";
import { manifest } from "./manifest";
import {
  FALLBACK_CATEGORY_CODE,
  categoryIdOf,
  getTodo,
  listCategories,
  type TodoRow,
} from "./queries";
import { TODO_PRIORITIES, todoAttachments, todos } from "./schema";

// TODO の Server Action(docs/DESIGN.md 25 章)。画面以外からも呼べるため、毎回
// requireAppAccess(アプリを使えるか)を通し、引数を zod で検証し、本人(user_id)のデータだけを扱う。

async function requireUserId(): Promise<string> {
  const actor = await requireAppAccess(manifest.appKey);
  return actor.userId;
}

const Id = z.uuid("不正なリクエストです。");
const TodoText = z.string().trim().min(1, "タスク名を入力してください。").max(200, "タスク名は200文字以内にしてください。");
const CategoryCode = z.string().regex(/^[a-z0-9_-]{1,50}$/, "カテゴリが不正です。");
const TodoFields = z.object({
  text: TodoText,
  done: z.boolean(),
  description: z.string().max(5000, "詳細は5000文字以内にしてください。"),
  priority: z.enum(TODO_PRIORITIES),
  category: CategoryCode,
  dueDate: z.union([z.iso.date(), z.literal("")]),
});
const TodoUpdate = TodoFields.partial().strict();
const TodoRestore = TodoFields.strict();

async function mustGet(userId: string, id: string): Promise<TodoRow> {
  const row = await getTodo(userId, id);
  if (!row) throw new Error("TODO が見つかりません。");
  return row;
}

export async function createTodoAction(input: string): Promise<TodoRow> {
  const userId = await requireUserId();
  const text = TodoText.parse(input);
  const code = await classifyCategory(text, await listCategories(), FALLBACK_CATEGORY_CODE);
  const [row] = await db
    .insert(todos)
    .values({ userId, text, categoryId: await categoryIdOf(code) })
    .returning({ id: todos.id });
  return mustGet(userId, row.id);
}

export async function updateTodoAction(idInput: string, fieldsInput: Partial<Omit<TodoRow, "id">>): Promise<TodoRow> {
  const userId = await requireUserId();
  const id = Id.parse(idInput);
  const f = TodoUpdate.parse(fieldsInput);
  const set: Partial<typeof todos.$inferInsert> = {};
  if (f.text !== undefined) set.text = f.text;
  if (f.done !== undefined) set.done = f.done;
  if (f.description !== undefined) set.description = f.description;
  if (f.priority !== undefined) set.priority = f.priority;
  if (f.category !== undefined) set.categoryId = await categoryIdOf(f.category);
  if (f.dueDate !== undefined) set.dueDate = f.dueDate || null;
  if (Object.keys(set).length > 0) {
    await db.update(todos).set(set).where(and(eq(todos.id, id), eq(todos.userId, userId)));
  }
  return mustGet(userId, id);
}

/** TODO を削除する。添付ファイル(R2)も消す(失敗しても TODO の削除は止めない)。 */
export async function deleteTodoAction(idInput: string): Promise<void> {
  const userId = await requireUserId();
  const id = Id.parse(idInput);
  const files = await db
    .select({ key: todoAttachments.objectKey })
    .from(todoAttachments)
    .where(and(eq(todoAttachments.todoId, id), eq(todoAttachments.userId, userId)));
  await db.delete(todos).where(and(eq(todos.id, id), eq(todos.userId, userId)));
  await Promise.all(
    files.map((f) => deleteObject(f.key).catch((err) => console.error("[todo] 添付の削除に失敗しました", err))),
  );
}

/** 削除の取り消し(内容を作り直す。添付ファイルは戻らない)。 */
export async function restoreTodoAction(input: Omit<TodoRow, "id">): Promise<TodoRow> {
  const userId = await requireUserId();
  const t = TodoRestore.parse(input);
  const [row] = await db
    .insert(todos)
    .values({
      userId,
      text: t.text,
      done: t.done,
      description: t.description,
      priority: t.priority,
      categoryId: await categoryIdOf(t.category),
      dueDate: t.dueDate || null,
    })
    .returning({ id: todos.id });
  return mustGet(userId, row.id);
}

// ---- 添付ファイル(Cloudflare R2)----------------------------------------------

export type AttachmentRow = { id: string; fileName: string; size: number; contentType: string };

const attachmentColumns = {
  id: todoAttachments.id,
  fileName: todoAttachments.fileName,
  size: todoAttachments.size,
  contentType: todoAttachments.contentType,
};

export async function listAttachmentsAction(todoIdInput: string): Promise<AttachmentRow[]> {
  const userId = await requireUserId();
  const todoId = Id.parse(todoIdInput);
  return db
    .select(attachmentColumns)
    .from(todoAttachments)
    .where(and(eq(todoAttachments.todoId, todoId), eq(todoAttachments.userId, userId)))
    .orderBy(asc(todoAttachments.createdAt));
}

/** ブラウザから R2 へ直接アップロードするための、署名付き URL を発行する(本人の TODO だけ)。 */
export async function createUploadUrlAction(
  todoIdInput: string,
  file: { fileName: string; size: number; contentType: string },
): Promise<{ url: string; key: string }> {
  const userId = await requireUserId();
  const todoId = Id.parse(todoIdInput);
  const request = uploadRequestSchema.parse(file);
  await mustGet(userId, todoId);
  const { url, key } = await createUploadUrl({ appKey: manifest.appKey, ownerId: userId, file: request });
  return { url, key };
}

/** アップロードの完了後に、メタ情報を登録する。キーが本人のものか・R2 に実在するかを確かめる。 */
export async function registerAttachmentAction(
  todoIdInput: string,
  keyInput: string,
  fileNameInput: string,
): Promise<AttachmentRow> {
  const userId = await requireUserId();
  const todoId = Id.parse(todoIdInput);
  const key = z.string().max(300).parse(keyInput);
  const fileName = z.string().trim().min(1).max(200).parse(fileNameInput);
  await mustGet(userId, todoId);
  if (!key.startsWith(`${currentKeyPrefix()}${manifest.appKey}/${userId}/`) || key.includes("..")) {
    throw new Error("不正なキーです。");
  }
  const head = await headObject(key);
  if (!head) throw new Error("アップロードが完了していません。");
  const [row] = await db
    .insert(todoAttachments)
    .values({
      todoId,
      userId,
      objectKey: key,
      fileName,
      size: head.size,
      contentType: head.contentType ?? "application/octet-stream",
    })
    .returning(attachmentColumns);
  return row;
}

export async function getDownloadUrlAction(idInput: string): Promise<string> {
  const userId = await requireUserId();
  const id = Id.parse(idInput);
  const [row] = await db
    .select({ key: todoAttachments.objectKey, fileName: todoAttachments.fileName })
    .from(todoAttachments)
    .where(and(eq(todoAttachments.id, id), eq(todoAttachments.userId, userId)));
  if (!row) throw new Error("ファイルが見つかりません。");
  return createDownloadUrl({ key: row.key, fileName: row.fileName });
}

export async function deleteAttachmentAction(idInput: string): Promise<void> {
  const userId = await requireUserId();
  const id = Id.parse(idInput);
  const [row] = await db
    .delete(todoAttachments)
    .where(and(eq(todoAttachments.id, id), eq(todoAttachments.userId, userId)))
    .returning({ key: todoAttachments.objectKey });
  if (row) await deleteObject(row.key).catch((err) => console.error("[todo] 添付の削除に失敗しました", err));
}
