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
import { createUploadUrl, currentKeyPrefix, deleteObject, headObject } from "../storage";
import { NOTICE_ATTACHMENT_MAX_BYTES, NOTICE_ATTACHMENT_MAX_COUNT } from "./constants";
import { isAllowedNoticeAttachment } from "./logic";
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

// ---- 添付ファイル(ブラウザから R2 へ直接アップロードし、保存のときに登録する)--------------

/** R2 での置き場所(core/storage のキーの「アプリのキー」の部分)。 */
const ATTACHMENT_APP_KEY = "notices";

const AttachmentUpload = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1, "ファイル名がありません。")
      .max(200, "ファイル名が長すぎます。")
      .refine(isAllowedNoticeAttachment, "このファイルの種類は付けられません(写真・PDF・Word・Excel・PowerPoint などにしてください)。"),
    contentType: z.string().max(100),
    size: z
      .number()
      .int()
      .min(1, "空のファイルは付けられません。")
      .max(NOTICE_ATTACHMENT_MAX_BYTES, `ファイルは 1 つ ${NOTICE_ATTACHMENT_MAX_BYTES / 1024 / 1024}MB までです。`),
  })
  .strict();

/** 添付を送るための署名付き URL。保存の前に送り、保存のときにキーを渡す。 */
export async function createNoticeAttachmentUploadUrlAction(
  input: z.input<typeof AttachmentUpload>,
): Promise<{ ok: true; url: string; key: string; contentType: string } | { ok: false; error: string }> {
  const actor = await requireGlobalPermission("core.notices.manage");
  const parsed = AttachmentUpload.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  // ブラウザが種類を空で送ることがあるので、そのときは「中身不明のファイル」として扱う。
  const contentType = /^[A-Za-z0-9][A-Za-z0-9.+-]*\/[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(parsed.data.contentType)
    ? parsed.data.contentType
    : "application/octet-stream";
  try {
    const { url, key } = await createUploadUrl({
      appKey: ATTACHMENT_APP_KEY,
      ownerId: actor.userId,
      file: { ...parsed.data, contentType },
    });
    return { ok: true, url, key, contentType };
  } catch (err) {
    console.error("[notices] 添付の送り先を作れませんでした", err);
    return { ok: false, error: "ファイルを送れませんでした。時間をおいて、もう一度お試しください。" };
  }
}

/** フォームの添付の並び。既にある添付は id、新しく送ったものは R2 のキーと元の名前。 */
const AttachmentEntry = z.union([
  z.object({ id: z.uuid() }).strict(),
  z.object({ key: z.string().min(1).max(300), fileName: z.string().trim().min(1).max(200) }).strict(),
]);
type AttachmentEntry = z.infer<typeof AttachmentEntry>;

function parseAttachmentEntries(formData: FormData): AttachmentEntry[] | null {
  const raw = formData.getAll("attachments").filter((v): v is string => typeof v === "string");
  if (raw.length > NOTICE_ATTACHMENT_MAX_COUNT) return null;
  const entries: AttachmentEntry[] = [];
  for (const r of raw) {
    try {
      const parsed = AttachmentEntry.safeParse(JSON.parse(r));
      if (!parsed.success) return null;
      entries.push(parsed.data);
    } catch {
      return null;
    }
  }
  return entries;
}

type NewAttachment = { storageKey: string; fileName: string; contentType: string; size: number; sortOrder: number };

/**
 * 新しく送った添付を確かめる: 本人がこの置き場所に送り終えたもので、種類と大きさが上限の内か。
 * (新しい添付がないときは R2 に触れない。R2 の設定がない環境でも、文章だけのお知らせは出せる。)
 */
async function verifyNewAttachments(
  entries: AttachmentEntry[],
  userId: string,
): Promise<{ ok: true; rows: NewAttachment[] } | { ok: false; error: string }> {
  const fresh = entries.flatMap((e, i) => ("key" in e ? [{ ...e, sortOrder: i }] : []));
  if (fresh.length === 0) return { ok: true, rows: [] };
  const ownPrefix = `${currentKeyPrefix()}${ATTACHMENT_APP_KEY}/${userId}/`;
  const rows: NewAttachment[] = [];
  for (const f of fresh) {
    if (!f.key.startsWith(ownPrefix) || f.key.includes("..") || !isAllowedNoticeAttachment(f.fileName)) {
      return { ok: false, error: "添付ファイルを付け直してください。" };
    }
    const head = await headObject(f.key);
    if (!head || head.size > NOTICE_ATTACHMENT_MAX_BYTES) {
      return { ok: false, error: `「${f.fileName}」の送信が終わっていません。付け直してください。` };
    }
    rows.push({
      storageKey: f.key,
      fileName: f.fileName,
      contentType: head.contentType ?? "application/octet-stream",
      size: head.size,
      sortOrder: f.sortOrder,
    });
  }
  return { ok: true, rows };
}

/** 保存の途中で、残すはずの添付がほかの画面で消されていたとき(トランザクションを戻すために throw する)。 */
class StaleAttachmentsError extends Error {}

/** R2 のファイルを消す(DB から外したあと。失敗しても、お知らせの変更は止めない)。 */
async function deleteStoredFiles(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((k) => deleteObject(k).catch((err) => console.error("[notices] 添付の削除に失敗しました", err))),
  );
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
  const attachmentEntries = parseAttachmentEntries(formData);
  if (!attachmentEntries) {
    return { error: `添付ファイルは ${NOTICE_ATTACHMENT_MAX_COUNT} 個までです。画面を読み込み直してください。` };
  }

  // 個人宛ては、権限 core.notices.individual を持つ人だけが作れる・直せる(docs/DESIGN.md 23 章)。
  const allowIndividual = canGlobally(actor, NOTICES_INDIVIDUAL);
  if (v.target === "individual" && !allowIndividual) return { error: "個人宛てのお知らせは出せません。" };
  if (id !== "" && !allowIndividual && (await isIndividualNotice(id))) return { error: "お知らせが見つかりません。" };

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

  const verified = await verifyNewAttachments(attachmentEntries, actor.userId);
  if (!verified.ok) return { error: verified.error };
  const keptOrder = new Map(attachmentEntries.flatMap((e, i) => ("id" in e ? [[e.id, i] as const] : [])));

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
  const savedId = await db
    .transaction(async (tx) => {
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

      // 添付: 画面で外したものは消し、残したものは並びを直し、新しいものを足す。
      const current = await tx
        .select({ id: announcementAttachments.id, storageKey: announcementAttachments.storageKey })
        .from(announcementAttachments)
        .where(eq(announcementAttachments.announcementId, noticeId));
      // 残すはずの添付が、ほかの画面で消されていたら、変更全体を取り消す(throw でトランザクションを戻す)。
      if ([...keptOrder.keys()].some((k) => !current.some((c) => c.id === k))) throw new StaleAttachmentsError();
      for (const c of current) {
        const order = keptOrder.get(c.id);
        if (order === undefined) {
          await tx.delete(announcementAttachments).where(eq(announcementAttachments.id, c.id));
          removedKeys.push(c.storageKey);
        } else {
          await tx.update(announcementAttachments).set({ sortOrder: order }).where(eq(announcementAttachments.id, c.id));
        }
      }
      if (verified.rows.length > 0) {
        await tx
          .insert(announcementAttachments)
          .values(verified.rows.map((r) => ({ ...r, announcementId: noticeId, createdBy: actor.userId })));
      }
      if (removedKeys.length > 0 || verified.rows.length > 0) {
        await writeAuditLog(tx, {
          actorUserId: actor.userId,
          action: "notice.attachments.update",
          targetType: "notice",
          targetId: noticeId,
          after: {
            removed: removedKeys.length,
            added: verified.rows.map((r) => ({ fileName: r.fileName, contentType: r.contentType, size: r.size })),
          },
        });
      }
      return noticeId;
    })
    .catch((err: unknown) => {
      if (err instanceof StaleAttachmentsError) return "stale" as const;
      throw err;
    });
  if (savedId === "stale") {
    return { error: "添付ファイルが、ほかの画面で変更されています。画面を読み込み直してください。" };
  }
  if (!savedId) return { error: "お知らせが見つかりません。" };
  await deleteStoredFiles(removedKeys);

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
      .select({ storageKey: announcementAttachments.storageKey })
      .from(announcementAttachments)
      .where(eq(announcementAttachments.announcementId, before.id));
    // 添付の行は CASCADE で消える。R2 のファイルは、削除が確定してから消す。
    await tx.delete(announcements).where(eq(announcements.id, before.id));
    removedKeys.push(...files.map((f) => f.storageKey));
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
  await deleteStoredFiles(removedKeys);
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
