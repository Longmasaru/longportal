"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import type { Actor } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { matchedAudienceIds } from "@/modules/core/audience";
import { writeAuditLog } from "@/modules/core/audit";
import { chapterOutline } from "./content";
import { canViewBook } from "./logic";
import { manifest } from "./manifest";
import { polishTsukkomi, type PolishResult } from "./polish";
import { canManageBooks } from "./queries";
import { kyokashoBooks, kyokashoCommentThanks, kyokashoComments } from "./schema";
import {
  BODY_MAX,
  COMMENT_KINDS,
  COMMENT_STATUSES,
  POLISH_MIN,
  QUOTE_MAX,
  REPLY_MAX,
  canDeleteOwnComment,
} from "./tsukkomi";
import { canHandleComments } from "./tsukkomi-queries";

// ツッコミの書き込み(docs/DESIGN.md 32 章)。書く・消す・ありがとうは、その教科書を見られる人だけ。
// 返事と採用の判断は、教科書チーム(kyokasho.comments.manage / kyokasho.books.manage)だけで、監査ログに残す。

export type TsukkomiFormState = { error?: string; success?: string; at?: number } | undefined;

const BASE = "/apps/kyokasho";

async function loadViewableBook(actor: Actor, bookId: string) {
  if (!z.uuid().safeParse(bookId).success) notFound();
  const [book] = await db.select().from(kyokashoBooks).where(eq(kyokashoBooks.id, bookId)).limit(1);
  if (!book) notFound();
  const matched = await matchedAudienceIds(
    actor.employee?.id ?? null,
    book.target === "audience" && book.audienceId ? [book.audienceId] : [],
    actor.today,
  );
  if (!canViewBook(book, matched, canManageBooks(actor))) notFound();
  return book;
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

const postSchema = z.object({
  bookId: z.uuid("不正なリクエストです。"),
  chapterNo: z.coerce.number().int().min(1).max(999),
  sectionId: z.string().max(80),
  quote: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(QUOTE_MAX, "引用が長すぎます。短く選び直してください。")),
  kind: z.enum(COMMENT_KINDS, "ツッコミの種類を選んでください。"),
  body: z
    .string()
    .trim()
    .min(1, "ツッコミの中身を書いてください。")
    .max(BODY_MAX, `ツッコミは${BODY_MAX}文字以内にしてください。`),
});

export async function postCommentAction(_prev: TsukkomiFormState, formData: FormData): Promise<TsukkomiFormState> {
  const actor = await requireAppAccess(manifest.appKey);
  const parsed = postSchema.safeParse({
    bookId: text(formData, "bookId"),
    chapterNo: text(formData, "chapterNo"),
    sectionId: text(formData, "sectionId"),
    quote: text(formData, "quote"),
    kind: text(formData, "kind"),
    body: text(formData, "body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  const v = parsed.data;
  const book = await loadViewableBook(actor, v.bookId);
  const chapter = book.content.chapters[v.chapterNo - 1];
  if (!chapter) return { error: "章が見つかりません。ページを開き直してください。" };
  // 節の題名は、送られてきた値ではなく、教科書の中身から写す。
  const section = v.sectionId ? chapterOutline(chapter).find((h) => h.id === v.sectionId) : undefined;

  await db.insert(kyokashoComments).values({
    bookId: book.id,
    chapterNo: v.chapterNo,
    chapterTitle: chapter.title.slice(0, 200),
    sectionId: section ? section.id : null,
    sectionTitle: section ? section.text.replace(/\*\*/g, "").slice(0, 200) : "",
    quote: v.quote,
    kind: v.kind,
    body: v.body,
    authorUserId: actor.userId,
  });
  revalidatePath(BASE, "layout");
  return { success: "ツッコミを送りました。ありがとうございます!", at: Date.now() };
}

/** 自分のツッコミを消す(教科書チームがまだ返事をしていないものだけ)。教科書チームは、どのツッコミも消せる(監査ログに残す)。 */
export async function deleteCommentAction(formData: FormData): Promise<void> {
  const actor = await requireAppAccess(manifest.appKey);
  const id = text(formData, "id");
  if (!z.uuid().safeParse(id).success) notFound();
  const [comment] = await db.select().from(kyokashoComments).where(eq(kyokashoComments.id, id)).limit(1);
  if (!comment) return;
  await loadViewableBook(actor, comment.bookId);
  if (canDeleteOwnComment(comment, actor.userId)) {
    await db.delete(kyokashoComments).where(eq(kyokashoComments.id, id));
  } else if (canHandleComments(actor)) {
    await db.transaction(async (tx) => {
      await tx.delete(kyokashoComments).where(eq(kyokashoComments.id, id));
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "kyokasho.comment.delete",
        targetType: "kyokasho_comment",
        targetId: id,
        before: {
          bookId: comment.bookId,
          chapterNo: comment.chapterNo,
          kind: comment.kind,
          body: comment.body,
          authorUserId: comment.authorUserId,
          status: comment.status,
          reply: comment.reply,
        },
      });
    });
  } else {
    notFound();
  }
  revalidatePath(BASE, "layout");
}

/** ほかの人のツッコミに「ありがとう」を送る・取り消す(自分のツッコミには送れない)。 */
export async function toggleThanksAction(formData: FormData): Promise<void> {
  const actor = await requireAppAccess(manifest.appKey);
  const id = text(formData, "id");
  if (!z.uuid().safeParse(id).success) notFound();
  const [comment] = await db
    .select({ bookId: kyokashoComments.bookId, authorUserId: kyokashoComments.authorUserId })
    .from(kyokashoComments)
    .where(eq(kyokashoComments.id, id))
    .limit(1);
  if (!comment) return;
  await loadViewableBook(actor, comment.bookId);
  if (comment.authorUserId === actor.userId) return;
  const where = and(eq(kyokashoCommentThanks.commentId, id), eq(kyokashoCommentThanks.userId, actor.userId));
  const [existing] = await db.select({ id: kyokashoCommentThanks.commentId }).from(kyokashoCommentThanks).where(where);
  if (existing) await db.delete(kyokashoCommentThanks).where(where);
  else await db.insert(kyokashoCommentThanks).values({ commentId: id, userId: actor.userId }).onConflictDoNothing();
  revalidatePath(BASE, "layout");
}

const handleSchema = z.object({
  id: z.uuid("不正なリクエストです。"),
  status: z.enum(COMMENT_STATUSES, "受け止め方を選んでください。"),
  reply: z.string().trim().max(REPLY_MAX, `返事は${REPLY_MAX}文字以内にしてください。`),
});

/** 教科書チームの返事と、採用の判断。 */
export async function handleCommentAction(_prev: TsukkomiFormState, formData: FormData): Promise<TsukkomiFormState> {
  const actor = await requireAppAccess(manifest.appKey);
  if (!canHandleComments(actor)) notFound();
  const parsed = handleSchema.safeParse({
    id: text(formData, "id"),
    status: text(formData, "status"),
    reply: text(formData, "reply"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  const { id, status, reply } = parsed.data;

  const error = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ status: kyokashoComments.status, reply: kyokashoComments.reply })
      .from(kyokashoComments)
      .where(eq(kyokashoComments.id, id));
    if (!before) return "ツッコミが見つかりません(消された可能性があります)。";
    const replyChanged = before.reply !== reply;
    await tx
      .update(kyokashoComments)
      .set({
        status,
        reply,
        ...(replyChanged ? { repliedBy: reply ? actor.userId : null, repliedAt: reply ? new Date() : null } : {}),
      })
      .where(eq(kyokashoComments.id, id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "kyokasho.comment.handle",
      targetType: "kyokasho_comment",
      targetId: id,
      before,
      after: { status, reply },
    });
    return null;
  });
  if (error) return { error };
  revalidatePath(BASE, "layout");
  return { success: "保存しました。", at: Date.now() };
}

const polishSchema = z.object({
  bookId: z.uuid("不正なリクエストです。"),
  chapterNo: z.number().int().min(1).max(999),
  sectionId: z.string().max(80),
  quote: z.string().max(QUOTE_MAX),
  kind: z.enum(COMMENT_KINDS, "ツッコミの種類を選んでください。"),
  body: z
    .string()
    .trim()
    .min(POLISH_MIN, `${POLISH_MIN}文字以上書いてから整えてください。`)
    .max(BODY_MAX, `ツッコミは${BODY_MAX}文字以内にしてください。`),
});

/** 書きかけのツッコミを AI で読みやすく整えた案を返す(保存はしない)。その教科書を見られる人だけ。 */
export async function polishTsukkomiAction(input: {
  bookId: string;
  chapterNo: number;
  sectionId: string;
  quote: string;
  kind: string;
  body: string;
}): Promise<PolishResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const parsed = polishSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  const v = parsed.data;
  const book = await loadViewableBook(actor, v.bookId);
  const chapter = book.content.chapters[v.chapterNo - 1];
  if (!chapter) return { error: "章が見つかりません。ページを開き直してください。" };
  const section = v.sectionId ? chapterOutline(chapter).find((h) => h.id === v.sectionId) : undefined;
  return polishTsukkomi({
    kind: v.kind,
    sectionTitle: section ? section.text.replace(/\*\*/g, "") : chapter.title,
    quote: v.quote,
    body: v.body,
  });
}
