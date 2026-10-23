"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { canGlobally, requireActor, requireGlobalPermission } from "../access";
import { audiences } from "../audience/schema";
import { writeAuditLog } from "../audit";
import { employees } from "../employees/schema";
import { isIsoDate } from "../shared/date";
import { createDownloadUrl, createUploadUrl, currentKeyPrefix, deleteObject, headObject } from "../storage";
import { MAX_NOTICE_ATTACHMENTS, NOTICE_POLISH_MIN, attachmentProblem } from "./constants";
import { polishNotice, type PolishResult } from "./polish";
import { getNoticeForActor, recordNoticeRead } from "./queries";
import {
  NOTICE_KINDS,
  NOTICE_PRIORITIES,
  NOTICE_TARGETS,
  announcementAttachments,
  announcementReads,
  announcementRecipients,
  announcements,
} from "./schema";

// お知らせの Server Action。管理は core.notices.manage(全社)で本判定し、変更は監査ログと同じトランザクションで記録する。
// 確認ボタンは、見る人ごとに宛先の判定(getNoticeForActor)を通す。

export type NoticeFormState = { error?: string; success?: string } | undefined;

const MAX_RECIPIENTS = 500;

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力内容を確認してください。";
}

const optionalDate = (label: string) =>
  z
    .string()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || isIsoDate(v), `${label}は正しい日付で入力してください。`);

const noticeSchema = z
  .object({
    title: z.string().trim().min(1, "タイトルを入力してください。").max(100, "タイトルは100文字以内にしてください。"),
    body: z
      .string()
      .transform((v) => v.replace(/\r\n/g, "\n").trim())
      .refine((v) => v.length <= 5000, "本文は5000文字以内にしてください。"),
    kind: z.enum(NOTICE_KINDS, "種類を選択してください。"),
    priority: z.enum(NOTICE_PRIORITIES, "重要度を選択してください。"),
    target: z.enum(NOTICE_TARGETS, "宛先を選択してください。"),
    audienceId: z.string(),
    requiresAction: z.boolean(),
    publishedOn: z.string().refine(isIsoDate, "掲載開始日を入力してください。"),
    expiresOn: optionalDate("掲載終了日"),
    bannerUntil: optionalDate("バナーの最終日"),
    recipientIds: z.array(z.uuid("宛先の社員が正しくありません。")).max(MAX_RECIPIENTS),
  })
  .superRefine((v, ctx) => {
    if (v.target === "audience" && !z.uuid().safeParse(v.audienceId).success) {
      ctx.addIssue({ code: "custom", message: "宛先の Audience を選択してください。" });
    }
    if (v.target === "individual" && v.recipientIds.length === 0) {
      ctx.addIssue({ code: "custom", message: "宛先の社員を 1 人以上選択してください。" });
    }
    if (v.expiresOn !== null && v.expiresOn < v.publishedOn) {
      ctx.addIssue({ code: "custom", message: "掲載終了日は、掲載開始日以降にしてください。" });
    }
    if (v.bannerUntil !== null && !(v.target === "company" && v.priority === "urgent")) {
      ctx.addIssue({ code: "custom", message: "ホームのバナーは、全社宛の「緊急」のお知らせだけに設定できます。" });
    }
  });

/** 添付の欄(画面が JSON で送る)。keep = 残す登録済みの添付の id、add = 今回アップロードしたもの。 */
const attachmentsFieldSchema = z.object({
  keep: z.array(z.uuid()).max(MAX_NOTICE_ATTACHMENTS),
  add: z
    .array(z.object({ key: z.string().min(1).max(300), fileName: z.string().trim().min(1).max(200) }))
    .max(MAX_NOTICE_ATTACHMENTS),
});

function parseAttachmentsField(formData: FormData) {
  const raw = formData.get("attachments");
  if (typeof raw !== "string" || raw === "") return { keep: [], add: [] };
  try {
    const parsed = attachmentsFieldSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** お知らせの添付の保存先の頭(この環境の、この人がアップロードしたものだけを受け付ける)。 */
function uploadKeyPrefix(userId: string): string {
  return `${currentKeyPrefix()}${ATTACHMENT_APP_KEY}/${userId}/`;
}
const ATTACHMENT_APP_KEY = "notices";

function parseNoticeForm(formData: FormData) {
  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };
  return noticeSchema.safeParse({
    title: text("title"),
    body: text("body"),
    kind: text("kind"),
    priority: text("priority"),
    target: text("target"),
    audienceId: text("audienceId"),
    requiresAction: formData.get("requiresAction") === "on",
    publishedOn: text("publishedOn"),
    expiresOn: text("expiresOn"),
    bannerUntil: text("bannerUntil"),
    recipientIds: [...new Set(formData.getAll("recipientIds").filter((v): v is string => typeof v === "string"))],
  });
}

const NOTICES_INDIVIDUAL = "core.notices.individual";

/** 個人宛てのお知らせか(権限のない人が、id を直接送って触れないようにする)。 */
async function isIndividualNotice(id: string): Promise<boolean> {
  const [row] = await db.select({ target: announcements.target }).from(announcements).where(eq(announcements.id, id));
  return row?.target === "individual";
}

/** お知らせの作成・更新。intent = publish なら公開、draft なら下書きとして保存する。 */
export async function saveNoticeAction(_prev: NoticeFormState, formData: FormData): Promise<NoticeFormState> {
  const actor = await requireGlobalPermission("core.notices.manage");
  const id = typeof formData.get("id") === "string" ? (formData.get("id") as string) : "";
  if (id !== "" && !z.uuid().safeParse(id).success) return { error: "不正なリクエストです。" };
  const intent = formData.get("intent") === "publish" ? "published" : "draft";
  const parsed = parseNoticeForm(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const v = parsed.data;

  // 個人宛ては、権限 core.notices.individual を持つ人だけが作れる・直せる(docs/DESIGN.md 23 章)。
  const allowIndividual = canGlobally(actor, NOTICES_INDIVIDUAL);
  if (v.target === "individual" && !allowIndividual) return { error: "個人宛てのお知らせは出せません。" };
  if (id !== "" && !allowIndividual && (await isIndividualNotice(id))) return { error: "お知らせが見つかりません。" };

  // 添付: 今回のアップロードは、この人がこの環境に置いたもので、実際に R2 にあるものだけを登録する。
  const files = parseAttachmentsField(formData);
  if (!files) return { error: "添付ファイルの情報が正しくありません。画面を読み込み直してください。" };
  if (files.keep.length + files.add.length > MAX_NOTICE_ATTACHMENTS) {
    return { error: `添付ファイルは ${MAX_NOTICE_ATTACHMENTS} 個までです。` };
  }
  const added: { objectKey: string; fileName: string; size: number; contentType: string }[] = [];
  for (const f of files.add) {
    if (!f.key.startsWith(uploadKeyPrefix(actor.userId)) || f.key.includes("..")) {
      return { error: "添付ファイルの情報が正しくありません。画面を読み込み直してください。" };
    }
    const head = await headObject(f.key);
    if (!head) return { error: `${f.fileName} のアップロードが終わっていません。もう一度添付してください。` };
    const problem = attachmentProblem({ name: f.fileName, size: head.size });
    if (problem) return { error: problem };
    added.push({
      objectKey: f.key,
      fileName: f.fileName,
      size: head.size,
      contentType: head.contentType ?? "application/octet-stream",
    });
  }

  // 宛先の存在を確かめる(無効な Audience も選べない)。
  if (v.target === "audience") {
    const [a] = await db
      .select({ id: audiences.id })
      .from(audiences)
      .where(and(eq(audiences.id, v.audienceId), eq(audiences.isActive, true)));
    if (!a) return { error: "選んだ Audience が見つからないか、無効です。" };
  }
  const recipientIds = v.target === "individual" ? v.recipientIds : [];
  if (recipientIds.length > 0) {
    const found = await db.select({ id: employees.id }).from(employees).where(inArray(employees.id, recipientIds));
    if (found.length !== recipientIds.length) return { error: "宛先の社員が見つかりません。画面を読み込み直してください。" };
  }

  const values = {
    title: v.title,
    body: v.body,
    kind: v.kind,
    priority: v.priority,
    target: v.target,
    audienceId: v.target === "audience" ? v.audienceId : null,
    requiresAction: v.requiresAction,
    status: intent,
    publishedOn: v.publishedOn,
    expiresOn: v.expiresOn,
    bannerUntil: v.bannerUntil,
    updatedBy: actor.userId,
  } as const;

  const removedKeys: string[] = [];
  const savedId = await db.transaction(async (tx) => {
    let noticeId = id;
    if (id === "") {
      const [created] = await tx.insert(announcements).values({ ...values, createdBy: actor.userId }).returning();
      noticeId = created.id;
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "notice.create",
        targetType: "notice",
        targetId: created.id,
        after: { ...created, recipientIds },
      });
    } else {
      const [before] = await tx.select().from(announcements).where(eq(announcements.id, id));
      if (!before) return null;
      const [after] = await tx.update(announcements).set(values).where(eq(announcements.id, id)).returning();
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "notice.update",
        targetType: "notice",
        targetId: id,
        before,
        after: { ...after, recipientIds },
      });
      await tx.delete(announcementRecipients).where(eq(announcementRecipients.announcementId, id));
    }
    if (recipientIds.length > 0) {
      await tx
        .insert(announcementRecipients)
        .values(recipientIds.map((employeeId) => ({ announcementId: noticeId, employeeId })));
    }
    // 添付: 画面で外したものを消し(本体はあとで R2 から消す)、今回のアップロードを登録する。
    const current = await tx
      .select({ id: announcementAttachments.id, objectKey: announcementAttachments.objectKey })
      .from(announcementAttachments)
      .where(eq(announcementAttachments.announcementId, noticeId));
    const removed = current.filter((c) => !files.keep.includes(c.id));
    if (removed.length > 0) {
      await tx.delete(announcementAttachments).where(
        inArray(
          announcementAttachments.id,
          removed.map((r) => r.id),
        ),
      );
    }
    if (added.length > 0) {
      await tx
        .insert(announcementAttachments)
        .values(added.map((f) => ({ ...f, announcementId: noticeId, uploadedBy: actor.userId })));
    }
    removedKeys.push(...removed.map((r) => r.objectKey));
    return noticeId;
  });
  if (!savedId) return { error: "お知らせが見つかりません。" };
  await deleteObjects(removedKeys);

  revalidatePath("/", "layout");
  redirect(`/admin/notices/${savedId}?saved=${intent}`);
}

const idSchema = z.object({ id: z.uuid("不正なリクエストです。") });

/** 公開中のお知らせを、下書きに戻す(社員から見えなくなる。既読・確認の記録は残す)。 */
export async function unpublishNoticeAction(_prev: NoticeFormState, formData: FormData): Promise<NoticeFormState> {
  const actor = await requireGlobalPermission("core.notices.manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!canGlobally(actor, NOTICES_INDIVIDUAL) && (await isIndividualNotice(parsed.data.id))) {
    return { error: "お知らせが見つかりません。" };
  }
  const ok = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(announcements).where(eq(announcements.id, parsed.data.id));
    if (!before) return false;
    const [after] = await tx
      .update(announcements)
      .set({ status: "draft", updatedBy: actor.userId })
      .where(eq(announcements.id, parsed.data.id))
      .returning();
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "notice.unpublish",
      targetType: "notice",
      targetId: before.id,
      before,
      after,
    });
    return true;
  });
  if (!ok) return { error: "お知らせが見つかりません。" };
  revalidatePath("/", "layout");
  return { success: "下書きに戻しました。社員からは見えなくなりました。" };
}

/** 下書きのお知らせを削除する(公開中のものは、先に下書きに戻す)。 */
export async function deleteNoticeAction(_prev: NoticeFormState, formData: FormData): Promise<NoticeFormState> {
  const actor = await requireGlobalPermission("core.notices.manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!canGlobally(actor, NOTICES_INDIVIDUAL) && (await isIndividualNotice(parsed.data.id))) {
    return { error: "お知らせが見つかりません。" };
  }
  const removedKeys: string[] = [];
  const error = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(announcements).where(eq(announcements.id, parsed.data.id));
    if (!before) return "お知らせが見つかりません。";
    if (before.status === "published") return "公開中のお知らせは削除できません。先に下書きに戻してください。";
    const files = await tx
      .select({ objectKey: announcementAttachments.objectKey })
      .from(announcementAttachments)
      .where(eq(announcementAttachments.announcementId, before.id));
    removedKeys.push(...files.map((f) => f.objectKey));
    await tx.delete(announcements).where(eq(announcements.id, before.id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "notice.delete",
      targetType: "notice",
      targetId: before.id,
      before,
    });
    return null;
  });
  if (error) return { error };
  await deleteObjects(removedKeys);
  revalidatePath("/", "layout");
  redirect("/admin/notices");
}

/** 「確認しました」。届いていて、確認が必要なお知らせだけ。 */
export async function acknowledgeNoticeAction(_prev: NoticeFormState, formData: FormData): Promise<NoticeFormState> {
  const actor = await requireActor();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const notice = await getNoticeForActor(actor, parsed.data.id);
  if (!notice || !notice.requiresAction) return { error: "このお知らせは確認の対象ではありません。" };

  const now = new Date();
  await db
    .insert(announcementReads)
    .values({ announcementId: notice.id, userId: actor.userId, readAt: now, acknowledgedAt: now })
    .onConflictDoUpdate({
      target: [announcementReads.announcementId, announcementReads.userId],
      // 2 回押しても、最初に確認した日時を残す。
      set: { acknowledgedAt: sql`coalesce(${announcementReads.acknowledgedAt}, now())` },
    });
  revalidatePath("/", "layout");
  return { success: "確認しました。" };
}

/**
 * ホームのお知らせで「続きを読む」を開いたときに、既読にする(詳細を開いたときと同じ扱い)。
 * 届いていないお知らせは何もしない。一覧の並びが急に変わらないよう、ここでは再描画しない。
 */
export async function markNoticeReadAction(id: string): Promise<void> {
  const actor = await requireActor();
  if (!z.uuid().safeParse(id).success) return;
  const notice = await getNoticeForActor(actor, id);
  if (notice && !notice.isRead) await recordNoticeRead(actor, notice.id);
}

/** R2 から添付の本体を消す(DB から外したあと。失敗してもお知らせの操作は止めない)。 */
async function deleteObjects(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((key) => deleteObject(key).catch((err) => console.error("[notices] 添付の削除に失敗しました", err))),
  );
}

/** 添付のアップロード先(署名付き URL)。お知らせ管理の権限を持つ人だけ。 */
export async function createNoticeUploadUrlAction(file: {
  fileName: string;
  size: number;
  contentType: string;
}): Promise<{ url: string; key: string } | { error: string }> {
  const actor = await requireGlobalPermission("core.notices.manage");
  const problem = attachmentProblem({ name: file.fileName, size: file.size });
  if (problem) return { error: problem };
  try {
    const { url, key } = await createUploadUrl({ appKey: ATTACHMENT_APP_KEY, ownerId: actor.userId, file });
    return { url, key };
  } catch {
    return { error: `${file.fileName} を添付できませんでした。` };
  }
}

/**
 * 添付のダウンロード(署名付き URL)。見られるのは、そのお知らせが届いている人と、お知らせ管理の人
 * (個人宛ては、個人宛ての権限も要る)だけ。
 */
export async function getNoticeAttachmentUrlAction(idInput: string): Promise<{ url: string } | { error: string }> {
  const actor = await requireActor();
  if (!z.uuid().safeParse(idInput).success) return { error: "ファイルが見つかりません。" };
  const [row] = await db
    .select({
      objectKey: announcementAttachments.objectKey,
      fileName: announcementAttachments.fileName,
      announcementId: announcementAttachments.announcementId,
      target: announcements.target,
    })
    .from(announcementAttachments)
    .innerJoin(announcements, eq(announcements.id, announcementAttachments.announcementId))
    .where(eq(announcementAttachments.id, idInput));
  if (!row) return { error: "ファイルが見つかりません。" };
  const asManager =
    canGlobally(actor, "core.notices.manage") && (row.target !== "individual" || canGlobally(actor, NOTICES_INDIVIDUAL));
  if (!asManager && !(await getNoticeForActor(actor, row.announcementId))) return { error: "ファイルが見つかりません。" };
  return { url: await createDownloadUrl({ key: row.objectKey, fileName: row.fileName }) };
}

/** 「AIで整える」。お知らせ管理の権限を持つ人だけ。案を返すだけで、保存はしない。 */
export async function polishNoticeAction(input: { title: string; body: string }): Promise<PolishResult> {
  await requireGlobalPermission("core.notices.manage");
  const body = String(input.body ?? "").slice(0, 5000);
  if (body.trim().length < NOTICE_POLISH_MIN) return { error: "もう少し書いてから整えてください。" };
  return polishNotice({ title: String(input.title ?? "").slice(0, 100), body });
}
