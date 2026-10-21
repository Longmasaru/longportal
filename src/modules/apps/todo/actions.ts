"use server";

import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { loadActor } from "@/modules/core/access";
import { canAccessApp, requireAppAccess } from "@/modules/core/apps";
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
  getSentRequest,
  getTodo,
  getTodoFacts,
  listCategories,
  type SentRequestRow,
  type TodoRow,
} from "./queries";
import { RETURN_REASON_MAX, abilitiesFor, resetOnRequestEdit } from "./requests";
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

const NOT_FOUND = "TODO が見つかりません。";

async function mustGet(userId: string, id: string): Promise<TodoRow> {
  const row = await getTodo(userId, id);
  if (!row) throw new Error(NOT_FOUND);
  return row;
}

/** 本人だけの TODO(依頼でないもの)を 1 件。添付ファイルはこれに限る(docs/DESIGN.md 39.2)。 */
async function mustGetPlain(userId: string, id: string): Promise<TodoRow> {
  const row = await mustGet(userId, id);
  if (row.request) throw new Error("依頼には添付ファイルを付けられません。");
  return row;
}

/** 見る人に関係のある TODO の、操作の判定(持ち主か頼んだ人でなければ「見つかりません」)。 */
async function mustAbilities(userId: string, id: string) {
  const facts = await getTodoFacts(userId, id);
  if (!facts) throw new Error(NOT_FOUND);
  const abilities = abilitiesFor(userId, facts);
  if (!abilities.canSee) throw new Error(NOT_FOUND);
  return { facts, abilities };
}

/** ホーム(依頼のお知らせ)と会社カレンダー(期限)に出る内容が変わったとき。 */
function revalidateRelated() {
  revalidatePath("/");
  revalidatePath("/apps/calendar");
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

type TodoFieldsInput = Partial<Omit<TodoRow, "id" | "request">>;

/**
 * 持ち主として TODO を変える。依頼(39 章)のときは、完了・カテゴリ・優先度だけ(タスク名・詳細・期限は頼んだ人のもの)。
 * 頼まれた人が何か操作したら、「確認しました」も付ける。
 */
export async function updateTodoAction(idInput: string, fieldsInput: TodoFieldsInput): Promise<TodoRow> {
  const userId = await requireUserId();
  const id = Id.parse(idInput);
  const f = TodoUpdate.parse(fieldsInput);
  const current = await mustGet(userId, id);
  const { abilities } = await mustAbilities(userId, id);
  if (current.request) {
    // 画面は依頼の内容も送ってくるので、変わっていない項目は無視し、変わっていれば断る。
    const changesContent =
      (f.text !== undefined && f.text !== current.text) ||
      (f.description !== undefined && f.description !== current.description) ||
      (f.dueDate !== undefined && f.dueDate !== current.dueDate);
    if (changesContent) throw new Error("依頼の内容は、頼んだ人だけが変えられます。");
    if (f.done !== undefined && f.done !== current.done && !abilities.canToggleDone) throw new Error("この依頼は完了にできません。");
    if ((f.priority !== undefined || f.category !== undefined) && !abilities.canOrganize) throw new Error("この依頼は変えられません。");
  }
  const set: Partial<typeof todos.$inferInsert> = {};
  if (!current.request) {
    if (f.text !== undefined) set.text = f.text;
    if (f.description !== undefined) set.description = f.description;
    if (f.dueDate !== undefined) set.dueDate = f.dueDate || null;
  }
  if (f.done !== undefined) set.done = f.done;
  if (f.priority !== undefined) set.priority = f.priority;
  if (f.category !== undefined) set.categoryId = await categoryIdOf(f.category);
  if (Object.keys(set).length > 0) {
    if (current.request && !current.request.acknowledged) set.acknowledgedAt = new Date();
    await db
      .update(todos)
      .set(set)
      // 依頼は、お返ししたあとは持ち主も変えられない
      .where(and(eq(todos.id, id), eq(todos.userId, userId), isNull(todos.returnedAt)));
    if (current.request || set.done !== undefined || set.dueDate !== undefined) revalidateRelated();
  }
  return mustGet(userId, id);
}

/** TODO を削除する(本人だけの TODO に限る。依頼はお返しか取り下げ)。添付ファイル(R2)も消す(失敗しても TODO の削除は止めない)。 */
export async function deleteTodoAction(idInput: string): Promise<void> {
  const userId = await requireUserId();
  const id = Id.parse(idInput);
  const { abilities } = await mustAbilities(userId, id);
  if (!abilities.canDelete) throw new Error("依頼は削除できません。やらない場合は「お返しする」を使ってください。");
  const files = await db
    .select({ key: todoAttachments.objectKey })
    .from(todoAttachments)
    .where(and(eq(todoAttachments.todoId, id), eq(todoAttachments.userId, userId)));
  await db.delete(todos).where(and(eq(todos.id, id), eq(todos.userId, userId), isNull(todos.requestedAt)));
  await Promise.all(
    files.map((f) => deleteObject(f.key).catch((err) => console.error("[todo] 添付の削除に失敗しました", err))),
  );
}

/** 削除の取り消し(内容を作り直す。添付ファイルは戻らない)。 */
export async function restoreTodoAction(input: Omit<TodoRow, "id" | "request">): Promise<TodoRow> {
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
  await mustGetPlain(userId, todoId);
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
  await mustGetPlain(userId, todoId);
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

// ---- 依頼(docs/DESIGN.md 39 章)--------------------------------------------------
// 頼んだ人(requested_by_user_id)と頼まれた人(user_id)の 2 人だけが扱う。判定は requests.ts の abilitiesFor。
// 本番では、Server Action で投げた例外の文言は画面に届かないため、利用者に見せる誤りは { error } で返す。

/** 利用者に見せてよい誤り。 */
class RequestError extends Error {}

export type RequestResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** RequestError だけを { error } にする(redirect・notFound などの Next.js の例外は、そのまま投げる)。 */
async function asResult<T>(run: () => Promise<T>): Promise<RequestResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (err) {
    if (err instanceof RequestError) return { ok: false, error: err.message };
    throw err;
  }
}

const RequestInput = z
  .object({
    assigneeUserId: z.uuid("頼む相手を選んでください。"),
    text: TodoText,
    description: z.string().max(5000, "メモは5000文字以内にしてください。"),
    dueDate: z.union([z.iso.date("期限の日付が正しくありません。"), z.literal("")]),
  })
  .strict();
export type RequestInput = z.infer<typeof RequestInput>;

function parseRequest(input: unknown): RequestInput {
  const parsed = RequestInput.safeParse(input);
  if (!parsed.success) throw new RequestError(parsed.error.issues[0]?.message ?? "入力が正しくありません。");
  return parsed.data;
}

/** 見る人に関係のある依頼の、操作の判定(持ち主か頼んだ人でなければ「見つかりません」)。 */
async function requestAbilities(userId: string, idInput: unknown) {
  const id = Id.safeParse(idInput);
  if (!id.success) throw new RequestError(NOT_FOUND);
  const facts = await getTodoFacts(userId, id.data);
  if (!facts || !facts.isRequest) throw new RequestError(NOT_FOUND);
  const abilities = abilitiesFor(userId, facts);
  if (!abilities.canSee) throw new RequestError(NOT_FOUND);
  return { id: id.data, facts, abilities };
}

/** 相手が、在籍中で有効なアカウントを持ち、TODO アプリを使える設定か。 */
async function assertAssignable(requesterId: string, assigneeUserId: string, today: string): Promise<void> {
  if (assigneeUserId === requesterId) throw new RequestError("自分には頼めません。自分の TODO として追加してください。");
  const result = await loadActor(assigneeUserId, today);
  if (!result.ok || !result.actor.employee) {
    throw new RequestError("この人には頼めません(在籍していないか、アカウントが使えません)。");
  }
  if (!(await canAccessApp(result.actor, manifest.appKey))) {
    throw new RequestError(`${result.actor.employee.name}さんは、TODO アプリを使えない設定です。`);
  }
}

async function mustGetSent(userId: string, id: string): Promise<SentRequestRow> {
  const row = await getSentRequest(userId, id);
  if (!row) throw new RequestError(NOT_FOUND);
  return row;
}

/** ほかの社員に TODO を頼む。カテゴリは、ふつうの追加と同じく自動分類する(25 章。送るのはタスク名だけ)。 */
export async function createRequestAction(input: RequestInput): Promise<RequestResult<SentRequestRow>> {
  const actor = await requireAppAccess(manifest.appKey);
  return asResult(async () => {
    const r = parseRequest(input);
    await assertAssignable(actor.userId, r.assigneeUserId, actor.today);
    const code = await classifyCategory(r.text, await listCategories(), FALLBACK_CATEGORY_CODE);
    const [row] = await db
      .insert(todos)
      .values({
        userId: r.assigneeUserId,
        text: r.text,
        description: r.description,
        dueDate: r.dueDate || null,
        categoryId: await categoryIdOf(code),
        requestedAt: new Date(),
        requestedByUserId: actor.userId,
      })
      .returning({ id: todos.id });
    revalidateRelated();
    return mustGetSent(actor.userId, row.id);
  });
}

/**
 * 頼んだ人が、相手・タスク名・メモ・期限を変える(完了するまで)。
 * 中身が変われば相手の「確認しました」を消し、お返しされたものは頼み直し(未完了に戻す)。
 */
export async function updateRequestAction(idInput: string, input: RequestInput): Promise<RequestResult<SentRequestRow>> {
  const actor = await requireAppAccess(manifest.appKey);
  return asResult(async () => {
    const { id, facts, abilities } = await requestAbilities(actor.userId, idInput);
    if (!abilities.canEditRequest) throw new RequestError("完了した依頼は変えられません。");
    const r = parseRequest(input);
    const assigneeChanged = r.assigneeUserId !== facts.userId;
    if (assigneeChanged) await assertAssignable(actor.userId, r.assigneeUserId, actor.today);
    const textChanged = r.text !== facts.text;
    const changed = assigneeChanged || textChanged || r.description !== facts.description || r.dueDate !== facts.dueDate;

    const set: Partial<typeof todos.$inferInsert> = {
      userId: r.assigneeUserId,
      text: r.text,
      description: r.description,
      dueDate: r.dueDate || null,
      ...resetOnRequestEdit(changed, facts.returned),
    };
    if (textChanged) {
      set.categoryId = await categoryIdOf(await classifyCategory(r.text, await listCategories(), FALLBACK_CATEGORY_CODE));
    }
    if (facts.returned) set.requestedAt = new Date();
    await db
      .update(todos)
      .set(set)
      .where(
        and(eq(todos.id, id), eq(todos.requestedByUserId, actor.userId), eq(todos.done, false), isNotNull(todos.requestedAt)),
      );
    revalidateRelated();
    return mustGetSent(actor.userId, id);
  });
}

/** 頼んだ人が取り下げる(完了するまで)。 */
export async function withdrawRequestAction(idInput: string): Promise<RequestResult<null>> {
  const userId = await requireUserId();
  return asResult(async () => {
    const { id, abilities } = await requestAbilities(userId, idInput);
    if (!abilities.canWithdraw) throw new RequestError("完了した依頼は取り下げられません。");
    await db
      .delete(todos)
      .where(and(eq(todos.id, id), eq(todos.requestedByUserId, userId), eq(todos.done, false), isNotNull(todos.requestedAt)));
    revalidateRelated();
    return null;
  });
}

/** 頼まれた人が、依頼をお返しする(未完了のとき。ひとことは任意)。 */
export async function returnRequestAction(idInput: string, reasonInput: string): Promise<RequestResult<null>> {
  const userId = await requireUserId();
  return asResult(async () => {
    const reason = z.string().trim().max(RETURN_REASON_MAX).safeParse(reasonInput ?? "");
    if (!reason.success) throw new RequestError(`ひとことは${RETURN_REASON_MAX}文字以内にしてください。`);
    const { id, abilities } = await requestAbilities(userId, idInput);
    if (!abilities.canReturn) throw new RequestError("この依頼はお返しできません。");
    const now = new Date();
    await db
      .update(todos)
      .set({ returnedAt: now, returnedReason: reason.data || null, acknowledgedAt: now })
      .where(
        and(eq(todos.id, id), eq(todos.userId, userId), isNotNull(todos.requestedAt), eq(todos.done, false), isNull(todos.returnedAt)),
      );
    revalidateRelated();
    return null;
  });
}

/** 頼まれた人の「確認しました」(ホームのお知らせを消す)。確認済み・完了・お返し済みなら何もしない。 */
export async function acknowledgeRequestAction(idInput: string): Promise<RequestResult<null>> {
  const userId = await requireUserId();
  return asResult(async () => {
    const { id, abilities } = await requestAbilities(userId, idInput);
    if (!abilities.canAcknowledge) return null;
    await db
      .update(todos)
      .set({ acknowledgedAt: new Date() })
      .where(and(eq(todos.id, id), eq(todos.userId, userId), isNotNull(todos.requestedAt), isNull(todos.acknowledgedAt)));
    revalidateRelated();
    return null;
  });
}
