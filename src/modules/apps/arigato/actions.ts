"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { canGlobally } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { writeAuditLog } from "@/modules/core/audit";
import {
  ARIGATO_TAGS,
  ARIGATO_VISIBILITIES,
  DAILY_SEND_LIMIT,
  MESSAGE_MAX_LENGTH,
} from "./constants";
import { manifest } from "./manifest";
import { checkRecipient, countSentOn, getCard, getMonthPoints, type CardRow } from "./queries";
import { arigatoCards, arigatoLikes } from "./schema";

// ありがとうカードの Server Action(docs/DESIGN.md 26 章)。画面以外からも呼べるため、
// 毎回 requireAppAccess(アプリを使えるか)を通し、引数を zod で検証する。

const Id = z.uuid("不正なリクエストです。");

const SendInput = z
  .object({
    toUserId: z.uuid("送る相手を選んでください。"),
    tag: z.enum(ARIGATO_TAGS, "「どんなこと」を選んでください。"),
    message: z
      .string()
      .trim()
      .min(1, "ひとことを入力してください。")
      .max(MESSAGE_MAX_LENGTH, `ひとことは${MESSAGE_MAX_LENGTH}文字以内にしてください。`),
    visibility: z.enum(ARIGATO_VISIBILITIES),
  })
  .strict();

/** myPoints = 送った人の今月の加点(送った・取り消した後の値)。 */
export type SendResult = { ok: true; card: CardRow; myPoints: number } | { ok: false; error: string };

export async function sendCardAction(input: z.input<typeof SendInput>): Promise<SendResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const parsed = SendInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入力を確認してください。" };
  const v = parsed.data;

  if (v.toUserId === actor.userId) return { ok: false, error: "自分には送れません。" };
  const recipient = await checkRecipient(v.toUserId, actor.today);
  if (!recipient.ok) return { ok: false, error: "この人には送れません(在籍していないか、アカウントがありません)。" };
  if ((await countSentOn(actor.userId, actor.today)) >= DAILY_SEND_LIMIT) {
    return { ok: false, error: `1日に送れるのは${DAILY_SEND_LIMIT}枚までです。また明日送ってください。` };
  }

  const [row] = await db
    .insert(arigatoCards)
    .values({
      fromUserId: actor.userId,
      toUserId: v.toUserId,
      toDepartmentId: recipient.departmentId,
      tag: v.tag,
      message: v.message,
      visibility: v.visibility,
      sentOn: actor.today,
    })
    .returning({ id: arigatoCards.id });
  const card = await getCard(actor.userId, row.id);
  if (!card) return { ok: false, error: "送信しましたが、表示に失敗しました。画面を読み込み直してください。" };
  const { points } = await getMonthPoints(actor.userId, actor.today.slice(0, 7));
  return { ok: true, card, myPoints: points };
}

/** いいねを付ける・外す(読めるカードだけ)。 */
export async function toggleLikeAction(idInput: string): Promise<{ liked: boolean; likeCount: number }> {
  const actor = await requireAppAccess(manifest.appKey);
  const id = Id.parse(idInput);
  const card = await getCard(actor.userId, id);
  if (!card || card.visibility !== "public") throw new Error("カードが見つかりません。");

  if (card.likedByMe) {
    await db.delete(arigatoLikes).where(and(eq(arigatoLikes.cardId, id), eq(arigatoLikes.userId, actor.userId)));
  } else {
    await db.insert(arigatoLikes).values({ cardId: id, userId: actor.userId }).onConflictDoNothing();
  }
  const after = await getCard(actor.userId, id);
  return { liked: after?.likedByMe ?? false, likeCount: after?.likeCount ?? 0 };
}

/**
 * カードを削除する。送った本人は自分のカードを、権限 arigato.cards.manage(全社)を持つ人は
 * どのカードでも削除できる(本人以外が消したときは監査ログに残す)。
 */
export async function deleteCardAction(idInput: string): Promise<{ myPoints: number }> {
  const actor = await requireAppAccess(manifest.appKey);
  const id = Id.parse(idInput);
  const myPoints = async () => ({ myPoints: (await getMonthPoints(actor.userId, actor.today.slice(0, 7))).points });
  const [card] = await db.select().from(arigatoCards).where(eq(arigatoCards.id, id));
  if (!card) return myPoints();

  if (card.fromUserId === actor.userId) {
    await db.delete(arigatoCards).where(eq(arigatoCards.id, id));
    return myPoints();
  }
  if (!canGlobally(actor, "arigato.cards.manage")) throw new Error("このカードは削除できません。");
  await db.transaction(async (tx) => {
    await tx.delete(arigatoCards).where(eq(arigatoCards.id, id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "arigato.card.delete",
      targetType: "arigato_card",
      targetId: id,
      before: card,
    });
  });
  return myPoints();
}
