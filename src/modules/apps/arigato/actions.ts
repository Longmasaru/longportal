"use server";

import { and, eq, isNull } from "drizzle-orm";
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
import { KOJO_WORDS, bashoOf, shikonaCandidates } from "./banzuke";
import { getFamilyName, takenShikona } from "./banzuke-queries";
import { manifest } from "./manifest";
import { checkRecipient, countSentOn, getCard, getMonthPoints, type CardRow } from "./queries";
import { arigatoBanzuke, arigatoCards, arigatoLikes, arigatoShikona } from "./schema";

// ありがとうカードの Server Action(docs/DESIGN.md 34 章)。画面以外からも呼べるため、
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

export type SimpleResult = { ok: true } | { ok: false; error: string };

/** 四股名を選ぶ(姓から作った候補の中からだけ。全社で重複しない)。 */
export async function chooseShikonaAction(nameInput: string): Promise<SimpleResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const name = z.string().trim().min(1).max(12).safeParse(nameInput);
  if (!name.success) return { ok: false, error: "四股名を選んでください。" };
  const familyName = await getFamilyName(actor.userId);
  if (!familyName || !shikonaCandidates(familyName).includes(name.data)) {
    return { ok: false, error: "候補の中から選んでください。" };
  }
  if ((await takenShikona([name.data], actor.userId)).size > 0) {
    return { ok: false, error: "その四股名は、ほかの人が使っています。" };
  }
  try {
    await db
      .insert(arigatoShikona)
      .values({ userId: actor.userId, name: name.data })
      .onConflictDoUpdate({ target: arigatoShikona.userId, set: { name: name.data, updatedAt: new Date() } });
  } catch {
    // 同時に同じ名前を選んだ場合(一意制約)
    return { ok: false, error: "その四股名は、ほかの人が使っています。" };
  }
  return { ok: true };
}

/** 伝達式の口上(新しく大関・横綱に上がった本人が、その場所で 1 回だけ選ぶ)。 */
export async function chooseKojoAction(wordInput: string): Promise<SimpleResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const word = KOJO_WORDS.find((w) => w.word === wordInput)?.word;
  if (!word) return { ok: false, error: "四字熟語を選んでください。" };
  const basho = bashoOf(actor.today);
  const updated = await db
    .update(arigatoBanzuke)
    .set({ kojoWord: word })
    .where(
      and(
        eq(arigatoBanzuke.basho, basho.key),
        eq(arigatoBanzuke.userId, actor.userId),
        eq(arigatoBanzuke.promoted, true),
        isNull(arigatoBanzuke.kojoWord),
      ),
    )
    .returning({ userId: arigatoBanzuke.userId });
  if (updated.length === 0) return { ok: false, error: "口上は、昇進した場所で 1 回だけ選べます。" };
  return { ok: true };
}
