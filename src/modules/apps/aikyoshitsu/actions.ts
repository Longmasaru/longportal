"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { canInAnyScope, type Actor } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { writeAuditLog } from "@/modules/core/audit";
import {
  createDownloadUrl,
  createUploadUrl,
  currentKeyPrefix,
  deleteObject,
  headObject,
} from "@/modules/core/storage";
import { MANAGE_PERMISSION, manifest } from "./manifest";
import { MATERIAL_MAX_MB, materialContentType, sessionInputSchema, type SessionInput } from "./policy";
import { getMaterial, getSession } from "./queries";
import { aiMaterials, aiSessions } from "./schema";

// AI教室の Server Action(docs/DESIGN.md 28 章)。画面以外からも呼べるため、毎回 requireAppAccess を通す。
// 資料を開く(署名付き URL の発行)はアプリを使える人なら誰でも。回と資料の変更は aikyoshitsu.materials.manage が要り、
// 変更は監査ログと同じトランザクションで記録する。

export type ActionResult = { error?: string };

const PATH = manifest.route;
const Id = z.uuid("不正なリクエストです。");

async function requireManager(): Promise<Actor> {
  const actor = await requireAppAccess(manifest.appKey);
  if (!canInAnyScope(actor, MANAGE_PERMISSION)) notFound();
  return actor;
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力内容を確認してください。";
}

/** 資料を開くための、署名付きの URL(5 分間有効)。 */
export async function getMaterialUrlAction(idInput: string): Promise<string> {
  await requireAppAccess(manifest.appKey);
  const material = await getMaterial(Id.parse(idInput));
  if (!material) throw new Error("資料が見つかりません。");
  return createDownloadUrl({ key: material.objectKey, fileName: material.fileName });
}

// ---- 回 ---------------------------------------------------------------------------

export async function createSessionAction(input: SessionInput): Promise<ActionResult> {
  const actor = await requireManager();
  const parsed = sessionInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(aiSessions)
      .values({ title: parsed.data.title, heldOn: parsed.data.heldOn })
      .returning({ id: aiSessions.id });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "aikyoshitsu.session.create",
      targetType: "aikyoshitsu.session",
      targetId: row.id,
      after: parsed.data,
    });
  });
  revalidatePath(PATH);
  return {};
}

export async function updateSessionAction(idInput: string, input: SessionInput): Promise<ActionResult> {
  const actor = await requireManager();
  const id = Id.parse(idInput);
  const parsed = sessionInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const before = await getSession(id);
  if (!before) return { error: "回が見つかりません。" };
  await db.transaction(async (tx) => {
    await tx.update(aiSessions).set({ title: parsed.data.title, heldOn: parsed.data.heldOn }).where(eq(aiSessions.id, id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "aikyoshitsu.session.update",
      targetType: "aikyoshitsu.session",
      targetId: id,
      before: { title: before.title, heldOn: before.heldOn },
      after: parsed.data,
    });
  });
  revalidatePath(PATH);
  return {};
}

/** 回を削除する。資料の行も消え(CASCADE)、R2 のファイルも消す(失敗しても削除は止めない)。 */
export async function deleteSessionAction(idInput: string): Promise<ActionResult> {
  const actor = await requireManager();
  const id = Id.parse(idInput);
  const before = await getSession(id);
  if (!before) return { error: "回が見つかりません。" };
  const files = await db
    .select({ key: aiMaterials.objectKey, fileName: aiMaterials.fileName })
    .from(aiMaterials)
    .where(eq(aiMaterials.sessionId, id));
  await db.transaction(async (tx) => {
    await tx.delete(aiSessions).where(eq(aiSessions.id, id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "aikyoshitsu.session.delete",
      targetType: "aikyoshitsu.session",
      targetId: id,
      before: { title: before.title, heldOn: before.heldOn, materials: files.map((f) => f.fileName) },
    });
  });
  await Promise.all(
    files.map((f) => deleteObject(f.key).catch((err) => console.error("[aikyoshitsu] 資料の削除に失敗しました", err))),
  );
  revalidatePath(PATH);
  return {};
}

// ---- 資料(Cloudflare R2)-----------------------------------------------------------

const FileRequest = z.object({
  fileName: z.string().trim().min(1, "ファイル名がありません。").max(200, "ファイル名が長すぎます。"),
  size: z
    .number()
    .int()
    .min(1, "空のファイルはアップロードできません。")
    .max(MATERIAL_MAX_MB * 1024 * 1024, `ファイルは ${MATERIAL_MAX_MB}MB までです。`),
  contentType: z.string().max(100),
});

/** ブラウザから R2 へ直接アップロードするための、署名付き URL を発行する。 */
export async function createMaterialUploadUrlAction(
  sessionIdInput: string,
  fileInput: { fileName: string; size: number; contentType: string },
): Promise<{ url: string; key: string; contentType: string } | ActionResult> {
  await requireManager();
  const sessionId = Id.parse(sessionIdInput);
  const parsed = FileRequest.safeParse(fileInput);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const contentType = materialContentType(parsed.data.fileName, parsed.data.contentType);
  if (!contentType) return { error: "PDF・PNG・JPEG のファイルを選んでください。" };
  if (!(await getSession(sessionId))) return { error: "回が見つかりません。" };
  const { url, key } = await createUploadUrl({
    appKey: manifest.appKey,
    ownerId: sessionId,
    file: { fileName: parsed.data.fileName, size: parsed.data.size, contentType },
  });
  return { url, key, contentType };
}

/** アップロードの完了後に、資料を登録する。キーがその回のものか・R2 に実在するかを確かめる。 */
export async function registerMaterialAction(
  sessionIdInput: string,
  keyInput: string,
  fileNameInput: string,
): Promise<ActionResult> {
  const actor = await requireManager();
  const sessionId = Id.parse(sessionIdInput);
  const key = z.string().max(300).parse(keyInput);
  const fileName = z.string().trim().min(1).max(200).parse(fileNameInput);
  if (!(await getSession(sessionId))) return { error: "回が見つかりません。" };
  if (!key.startsWith(`${currentKeyPrefix()}${manifest.appKey}/${sessionId}/`) || key.includes("..")) {
    return { error: "不正なキーです。" };
  }
  const head = await headObject(key);
  if (!head) return { error: "アップロードが完了していません。" };
  const contentType = materialContentType(fileName, head.contentType ?? "");
  if (!contentType) return { error: "PDF・PNG・JPEG のファイルを選んでください。" };
  await db.transaction(async (tx) => {
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${aiMaterials.sortOrder}), -1) + 1` })
      .from(aiMaterials)
      .where(eq(aiMaterials.sessionId, sessionId));
    const [row] = await tx
      .insert(aiMaterials)
      .values({
        sessionId,
        objectKey: key,
        fileName,
        size: head.size,
        contentType,
        sortOrder: Number(next),
        uploadedBy: actor.userId,
      })
      .returning({ id: aiMaterials.id });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "aikyoshitsu.material.create",
      targetType: "aikyoshitsu.material",
      targetId: row.id,
      after: { sessionId, fileName, size: head.size },
    });
  });
  revalidatePath(PATH);
  return {};
}

/** 資料の表示名(ファイル名)を変える。 */
export async function renameMaterialAction(idInput: string, fileNameInput: string): Promise<ActionResult> {
  const actor = await requireManager();
  const id = Id.parse(idInput);
  const parsed = z
    .string()
    .trim()
    .min(1, "資料の名前を入力してください。")
    .max(200, "資料の名前は200文字以内にしてください。")
    .safeParse(fileNameInput);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const before = await getMaterial(id);
  if (!before) return { error: "資料が見つかりません。" };
  await db.transaction(async (tx) => {
    await tx.update(aiMaterials).set({ fileName: parsed.data }).where(eq(aiMaterials.id, id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "aikyoshitsu.material.update",
      targetType: "aikyoshitsu.material",
      targetId: id,
      before: { fileName: before.fileName },
      after: { fileName: parsed.data },
    });
  });
  revalidatePath(PATH);
  return {};
}

/** 資料を削除する(R2 のファイルも消す。失敗しても削除は止めない)。 */
export async function deleteMaterialAction(idInput: string): Promise<ActionResult> {
  const actor = await requireManager();
  const id = Id.parse(idInput);
  const before = await getMaterial(id);
  if (!before) return { error: "資料が見つかりません。" };
  await db.transaction(async (tx) => {
    await tx.delete(aiMaterials).where(eq(aiMaterials.id, id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "aikyoshitsu.material.delete",
      targetType: "aikyoshitsu.material",
      targetId: id,
      before: { sessionId: before.sessionId, fileName: before.fileName },
    });
  });
  await deleteObject(before.objectKey).catch((err) => console.error("[aikyoshitsu] 資料の削除に失敗しました", err));
  revalidatePath(PATH);
  return {};
}
