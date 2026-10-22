"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAppAccess } from "@/modules/core/apps";
import { writeAuditLog } from "@/modules/core/audit";
import { sendLineWorksChannelText } from "@/modules/core/lineworks";
import { createUploadUrl, currentKeyPrefix, deleteObject, headObject } from "@/modules/core/storage";
import {
  BODY_MAX,
  CATEGORY_LABEL,
  DAILY_POST_LIMIT,
  DESTINATION_LABEL,
  MEYASUBAKO_CATEGORIES,
  MEYASUBAKO_DESTINATIONS,
  MEYASUBAKO_STATUSES,
  MEYASUBAKO_VISIBILITIES,
  MESSAGE_MAX,
  MISSING_MESSAGE,
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_COUNT,
  PLACE_MAX,
  POLISH_MIN,
  VISIBILITY_LABEL,
  missingFields,
  postAccess,
  type MeyasubakoStatus,
} from "./constants";
import { manifest } from "./manifest";
import { noticeNewPost } from "./notify";
import { polishMeyasubako, type PolishResult } from "./polish";
import { canManagePosts, canRespondTo, countPostedOn, getPostForAction, photoKeysOf } from "./queries";
import { meyasubakoMessages, meyasubakoPhotos, meyasubakoPosts } from "./schema";

// 目安箱の Server Action(docs/DESIGN.md 42 章)。画面以外からも呼べるため、毎回
// requireAppAccess(アプリを使えるか)を通し、引数を zod で検証し、投稿ごとの見え方(postAccess)で判定する。

const BASE = "/apps/meyasubako";
const Id = z.uuid("不正なリクエストです。");

export type ActionResult = { ok: true } | { ok: false; error: string };

// ---- 写真(ブラウザから R2 へ直接アップロードする)--------------------------------

const PhotoRequest = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    contentType: z.enum(PHOTO_CONTENT_TYPES, "写真は JPEG・PNG・WebP にしてください。"),
    size: z
      .number()
      .int()
      .min(1, "空のファイルは送れません。")
      .max(PHOTO_MAX_BYTES, `写真は ${PHOTO_MAX_BYTES / 1024 / 1024}MB までです。`),
  })
  .strict();

/** 写真を送るための署名付き URL。投稿の前に送り、投稿のときにキーを渡す。 */
export async function createPhotoUploadUrlAction(
  input: z.input<typeof PhotoRequest>,
): Promise<{ ok: true; url: string; key: string } | { ok: false; error: string }> {
  const actor = await requireAppAccess(manifest.appKey);
  const parsed = PhotoRequest.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "写真を確認してください。" };
  try {
    const { url, key } = await createUploadUrl({ appKey: manifest.appKey, ownerId: actor.userId, file: parsed.data });
    return { ok: true, url, key };
  } catch (err) {
    console.error("[meyasubako] 写真の送り先を作れませんでした", err);
    return { ok: false, error: "写真を送れませんでした。時間をおいて、もう一度お試しください。" };
  }
}

// ---- 投稿 ------------------------------------------------------------------------

const PostInput = z
  .object({
    category: z.enum(MEYASUBAKO_CATEGORIES),
    destination: z.enum(MEYASUBAKO_DESTINATIONS),
    visibility: z.enum(MEYASUBAKO_VISIBILITIES),
    anonymous: z.boolean(),
    place: z.string().trim().max(PLACE_MAX, `場所は${PLACE_MAX}文字以内にしてください。`),
    body: z.string().trim().max(BODY_MAX, `内容は${BODY_MAX}文字以内にしてください。`),
    photoKeys: z.array(z.string().max(300)).max(PHOTO_MAX_COUNT, `写真は${PHOTO_MAX_COUNT}枚までです。`),
  })
  .strict();

export type CreatePostResult = { ok: true; id: string } | { ok: false; error: string };

export async function createPostAction(input: {
  category: string | null;
  destination: string;
  visibility: string | null;
  anonymous: boolean;
  place: string;
  body: string;
  photoKeys: string[];
}): Promise<CreatePostResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const missing = missingFields({
    category: input.category,
    visibility: input.visibility,
    body: input.body ?? "",
    photoCount: input.photoKeys?.length ?? 0,
  });
  if (missing.length > 0) return { ok: false, error: `まだ送れません: ${missing.map((m) => MISSING_MESSAGE[m]).join("、")}` };
  const parsed = PostInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入力を確認してください。" };
  const v = parsed.data;

  if ((await countPostedOn(actor.userId, actor.today)) >= DAILY_POST_LIMIT) {
    return { ok: false, error: `1日に送れるのは${DAILY_POST_LIMIT}件までです。また明日送ってください。` };
  }

  // 写真は、本人がこのアプリの置き場所に送り終えたものだけを受け付ける。
  // (写真がないときは R2 に触れない。R2 の設定がない環境でも、文章だけの投稿はできる。)
  const photos: { storageKey: string; contentType: string; size: number }[] = [];
  const ownPrefix = v.photoKeys.length > 0 ? `${currentKeyPrefix()}${manifest.appKey}/${actor.userId}/` : "";
  for (const key of new Set(v.photoKeys)) {
    if (!key.startsWith(ownPrefix) || key.includes("..")) return { ok: false, error: "写真を送り直してください。" };
    const head = await headObject(key);
    const contentType = head?.contentType ?? "";
    if (!head || !(PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType) || head.size > PHOTO_MAX_BYTES) {
      return { ok: false, error: "写真の送信が終わっていません。写真を付け直してください。" };
    }
    photos.push({ storageKey: key, contentType, size: head.size });
  }

  // リーダー宛ての範囲の判定に使うため、投稿した時点の主所属を残す(異動しても変えない)。
  const primary = actor.assignments.find((a) => a.isPrimary) ?? actor.assignments[0];
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(meyasubakoPosts)
      .values({
        authorUserId: actor.userId,
        departmentId: primary?.departmentId ?? null,
        locationId: primary?.locationId ?? null,
        category: v.category,
        destination: v.destination,
        visibility: v.visibility,
        anonymous: v.anonymous,
        place: v.place,
        body: v.body,
        postedOn: actor.today,
        authorReadAt: new Date(),
      })
      .returning({ id: meyasubakoPosts.id });
    if (photos.length > 0) {
      await tx.insert(meyasubakoPhotos).values(photos.map((p, i) => ({ ...p, postId: row.id, sortOrder: i })));
    }
    return row.id;
  });
  revalidatePath(BASE, "layout");

  // 返事をする人の LINE WORKS のトークルームへ知らせる(設定があるときだけ。返事を待たずに画面を返す)。
  const host = (await headers()).get("host");
  const name = v.anonymous ? "匿名" : `${actor.employee?.name ?? actor.loginId} さん`;
  const preview = v.body ? (v.body.length > 120 ? `${v.body.slice(0, 120)}…` : v.body) : "(写真のみ)";
  const message = [
    `${v.category === "hazard" ? "⚠️" : "📮"} 目安箱に新しい投稿【${CATEGORY_LABEL[v.category].label}】`,
    `${DESTINATION_LABEL[v.destination]}・${VISIBILITY_LABEL[v.visibility].label}${photos.length ? `・写真${photos.length}枚` : ""}`,
    v.place ? `場所: ${v.place}` : "",
    `${name}: ${preview}`,
    host ? `https://${host}${BASE}/${id}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  after(() => sendLineWorksChannelText(process.env.MEYASUBAKO_LINEWORKS_CHANNEL_ID, message).then(() => undefined));
  // 返事ができる人の「お知らせ → 個人」にも届ける。失敗しても投稿は取り消さない。
  after(() =>
    noticeNewPost({
      postId: id,
      authorUserId: actor.userId,
      category: v.category,
      destination: v.destination,
      visibility: v.visibility,
      locationId: primary?.locationId ?? null,
      departmentId: primary?.departmentId ?? null,
      today: actor.today,
      origin: host ? `https://${host}` : null,
    }).catch((e) => console.error("目安箱: お知らせを届けられませんでした", e)),
  );

  return { ok: true, id };
}

// ---- やり取り・状況 --------------------------------------------------------------

async function loadForWrite(postId: string) {
  if (!Id.safeParse(postId).success) return null;
  return getPostForAction(postId);
}

const MessageBody = z
  .string()
  .trim()
  .min(1, "書く内容を入力してください。")
  .max(MESSAGE_MAX, `${MESSAGE_MAX}文字以内にしてください。`);

/** 返事、または投稿者の書き足し。 */
export async function addMessageAction(postId: string, bodyInput: string): Promise<ActionResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const post = await loadForWrite(postId);
  if (!post) return { ok: false, error: "投稿が見つかりません。" };
  const access = postAccess(post, actor.userId, canRespondTo(actor, post));
  if (!access.message) return { ok: false, error: "この投稿には書き込めません。" };
  const body = MessageBody.safeParse(bodyInput);
  if (!body.success) return { ok: false, error: body.error.issues[0]?.message ?? "入力を確認してください。" };

  // 本人の投稿なら、返事ができる人でも「書き足し」として扱う。
  const fromResponder = !access.isAuthor;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(meyasubakoMessages).values({ postId: post.id, authorUserId: actor.userId, fromResponder, body: body.data });
    await tx
      .update(meyasubakoPosts)
      .set(
        fromResponder
          ? { responderActivityAt: now, responderReadAt: now, ...(post.status === "new" ? { status: "seen" as const } : {}) }
          : { authorActivityAt: now, authorReadAt: now },
      )
      .where(eq(meyasubakoPosts.id, post.id));
  });
  revalidatePath(BASE, "layout");
  return { ok: true };
}

/** 対応の状況を変える(返事ができる人だけ)。 */
export async function setStatusAction(postId: string, statusInput: string): Promise<ActionResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const post = await loadForWrite(postId);
  if (!post || !canRespondTo(actor, post)) return { ok: false, error: "投稿が見つかりません。" };
  const status = z.enum(MEYASUBAKO_STATUSES).safeParse(statusInput);
  if (!status.success) return { ok: false, error: "状況を選んでください。" };
  if (status.data === post.status) return { ok: true };
  const now = new Date();
  await db
    .update(meyasubakoPosts)
    .set({ status: status.data, responderActivityAt: now, responderReadAt: now })
    .where(eq(meyasubakoPosts.id, post.id));
  revalidatePath(BASE, "layout");
  return { ok: true };
}

/** 投稿を開いたことを残す(未読の印を消す)。返事をする人が開いた未読の投稿は「確認済み」にする。 */
export async function markReadAction(postId: string): Promise<void> {
  const actor = await requireAppAccess(manifest.appKey);
  const post = await loadForWrite(postId);
  if (!post) return;
  const access = postAccess(post, actor.userId, canRespondTo(actor, post));
  const now = new Date();
  let set: Partial<typeof meyasubakoPosts.$inferInsert> | null = null;
  if (access.isAuthor) set = { authorReadAt: now };
  else if (access.respond) {
    set = { responderReadAt: now };
    if (post.status === "new") Object.assign(set, { status: "seen" satisfies MeyasubakoStatus, responderActivityAt: now });
  }
  if (!set) return;
  await db.update(meyasubakoPosts).set(set).where(eq(meyasubakoPosts.id, post.id));
  revalidatePath(BASE, "layout");
}

/** 投稿を削除する(管理する人だけ。不適切な内容への対応。監査ログに残す)。写真も R2 から消す。 */
export async function deletePostAction(postId: string): Promise<ActionResult> {
  const actor = await requireAppAccess(manifest.appKey);
  if (!canManagePosts(actor)) return { ok: false, error: "削除できません。" };
  const post = await loadForWrite(postId);
  if (!post) return { ok: false, error: "投稿が見つかりません。" };
  const keys = await photoKeysOf([post.id]);
  await db.transaction(async (tx) => {
    await tx.delete(meyasubakoPosts).where(eq(meyasubakoPosts.id, post.id));
    // 本文は残さない(相談など個人的な内容がありうるため)。種類・宛先・状況と投稿者だけ。
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "meyasubako.post.delete",
      targetType: "meyasubako_post",
      targetId: post.id,
      before: {
        authorUserId: post.authorUserId,
        category: post.category,
        destination: post.destination,
        visibility: post.visibility,
        anonymous: post.anonymous,
        status: post.status,
        photoCount: keys.length,
      },
    });
  });
  await Promise.all(
    keys.map((k) => deleteObject(k).catch((err) => console.error("[meyasubako] 写真の削除に失敗しました", err))),
  );
  revalidatePath(BASE, "layout");
  return { ok: true };
}


// ---- AIで整える --------------------------------------------------------------

const PolishInput = z.object({
  purpose: z.enum(["post", "reply"]),
  category: z.enum(MEYASUBAKO_CATEGORIES).nullable(),
  body: z
    .string()
    .trim()
    .min(POLISH_MIN, `${POLISH_MIN}文字以上書いてから整えてください。`)
    .max(BODY_MAX, `${BODY_MAX}文字以内にしてください。`),
});

/** 書きかけの投稿・返事を AI で読みやすく整えた案を返す(保存はしない)。目安箱を使える人だけ。 */
export async function polishAction(input: {
  purpose: "post" | "reply";
  category: string | null;
  body: string;
}): Promise<PolishResult> {
  await requireAppAccess(manifest.appKey);
  const parsed = PolishInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力を確認してください。" };
  return polishMeyasubako(parsed.data);
}
