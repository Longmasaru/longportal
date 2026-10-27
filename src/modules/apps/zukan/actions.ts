"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAppAccess } from "@/modules/core/apps";
import { users } from "@/modules/core/auth/schema";
import { writeAuditLog } from "@/modules/core/audit";
import { sendLineWorksChannelText } from "@/modules/core/lineworks";
import { createUploadUrl, currentKeyPrefix, deleteObject, headObject } from "@/modules/core/storage";
import { draftFromPhotos, reviewEntry, type AiPhoto, type DraftResult } from "./ai";
import {
  APPRAISAL_COMMENT_MAX,
  CHAPTER_LABEL,
  COMMENT_MAX,
  CRITERION_MAX,
  CRITERION_MIN,
  DAILY_ENTRY_LIMIT,
  EFFECT_MAX,
  MEMO_MAX,
  MISSING_MESSAGE,
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_PER_KIND,
  PLACE_MAX,
  REACTION_KINDS,
  TITLE_MAX,
  WHAT_MAX,
  ZUKAN_CHAPTERS,
  formatNo,
  missingFields,
  scoreOf,
  type PhotoKind,
} from "./constants";
import { manifest } from "./manifest";
import { noticeAppraised, noticeNewEntry } from "./notify";
import {
  canAppraise,
  canManageEntries,
  canViewEntry,
  countPostedOn,
  firstPhotosOf,
  getDraftForEdit,
  getEntryForAction,
  photoKeysOf,
} from "./queries";
import { zukanComments, zukanEntries, zukanPhotos, zukanReactions } from "./schema";

// カイゼン図鑑の Server Action(docs/DESIGN.md 44 章)。画面以外からも呼べるため、毎回
// requireAppAccess(アプリを使えるか)を通し、引数を zod で検証し、ページごとに見てよいかを判定する。

const BASE = "/apps/zukan";
const Id = z.uuid("不正なリクエストです。");

export type ActionResult = { ok: true } | { ok: false; error: string };

async function origin(): Promise<string | null> {
  const host = (await headers()).get("host");
  return host ? `https://${host}` : null;
}

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

/** 写真を送るための署名付き URL。保存の前に送り、保存のときにキーを渡す。 */
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
    console.error("[zukan] 写真の送り先を作れませんでした", err);
    return { ok: false, error: "写真を送れませんでした。時間をおいて、もう一度お試しください。" };
  }
}

/** 本人がこのアプリの置き場所に送り終えた写真か(R2 に実在し、種類と大きさが合う)。 */
async function verifyOwnPhoto(userId: string, key: string): Promise<{ contentType: string; size: number } | null> {
  const ownPrefix = `${currentKeyPrefix()}${manifest.appKey}/${userId}/`;
  if (!key.startsWith(ownPrefix) || key.includes("..")) return null;
  const head = await headObject(key);
  const contentType = head?.contentType ?? "";
  if (!head || !(PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType) || head.size > PHOTO_MAX_BYTES) return null;
  return { contentType, size: head.size };
}

// ---- 保存(発見待ち・登録) ------------------------------------------------------------

const PhotoKeys = z.array(z.string().max(300)).max(PHOTO_MAX_PER_KIND, `写真はそれぞれ${PHOTO_MAX_PER_KIND}枚までです。`);
const EntryInput = z
  .object({
    mode: z.enum(["publish", "draft"]),
    draftId: Id.nullable(),
    title: z.string().trim().max(TITLE_MAX, `名前は${TITLE_MAX}文字以内にしてください。`),
    chapter: z.enum(ZUKAN_CHAPTERS).nullable(),
    what: z.string().trim().max(WHAT_MAX, `「何をしたか」は${WHAT_MAX}文字以内にしてください。`),
    effect: z.string().trim().max(EFFECT_MAX, `効果は${EFFECT_MAX}文字以内にしてください。`),
    place: z.string().trim().max(PLACE_MAX, `場所は${PLACE_MAX}文字以内にしてください。`),
    before: PhotoKeys,
    after: PhotoKeys,
  })
  .strict();

export type SaveEntryResult = { ok: true; id: string; published: boolean } | { ok: false; error: string };

export async function saveEntryAction(input: {
  mode: "publish" | "draft";
  draftId: string | null;
  title: string;
  chapter: string | null;
  what: string;
  effect: string;
  place: string;
  before: string[];
  after: string[];
}): Promise<SaveEntryResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const missing = missingFields({
    mode: input.mode,
    beforeCount: input.before?.length ?? 0,
    afterCount: input.after?.length ?? 0,
    title: input.title ?? "",
    chapter: input.chapter,
  });
  if (missing.length > 0) return { ok: false, error: `まだ保存できません: ${missing.map((m) => MISSING_MESSAGE[m]).join("、")}` };
  const parsed = EntryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入力を確認してください。" };
  const v = parsed.data;

  // 発見待ちの続きなら、本人の下書きだけを受け付ける。すでに付いている写真は確かめ直さない。
  const draft = v.draftId ? await getDraftForEdit(actor, v.draftId) : null;
  if (v.draftId && !draft) return { ok: false, error: "発見待ちのページが見つかりません。" };
  if (!draft && (await countPostedOn(actor.userId, actor.today)) >= DAILY_ENTRY_LIMIT) {
    return { ok: false, error: `1日に保存できるのは${DAILY_ENTRY_LIMIT}件までです。また明日登録してください。` };
  }
  const existing = new Map((draft?.photos ?? []).map((p) => [p.storageKey, p]));

  const photos: { kind: PhotoKind; storageKey: string; contentType: string; size: number; sortOrder: number }[] = [];
  const seen = new Set<string>();
  for (const [kind, keys] of [["before", v.before], ["after", v.after]] as const) {
    for (const [i, key] of keys.entries()) {
      if (seen.has(key)) continue;
      seen.add(key);
      if (existing.has(key)) {
        const [row] = await db.select().from(zukanPhotos).where(eq(zukanPhotos.storageKey, key)).limit(1);
        if (!row) return { ok: false, error: "写真を付け直してください。" };
        photos.push({ kind, storageKey: key, contentType: row.contentType, size: row.size, sortOrder: i });
        continue;
      }
      const head = await verifyOwnPhoto(actor.userId, key);
      if (!head) return { ok: false, error: "写真の送信が終わっていません。写真を付け直してください。" };
      photos.push({ kind, storageKey: key, ...head, sortOrder: i });
    }
  }
  const removedKeys = [...existing.keys()].filter((k) => !seen.has(k));

  const primary = actor.assignments.find((a) => a.isPrimary) ?? actor.assignments[0];
  const publish = v.mode === "publish";
  const now = new Date();
  const fields = {
    title: v.title,
    chapter: v.chapter,
    what: v.what,
    effect: v.effect,
    place: v.place,
  };

  const saved = await db.transaction(async (tx) => {
    let number: number | null = null;
    if (publish) {
      // 図鑑番号は登録した順。同時に登録されても同じ番号にならないよう、直列にして max + 1 を取る。
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('zukan.entry_number'))`);
      const [row] = await tx.select({ max: sql<number | null>`max(${zukanEntries.number})` }).from(zukanEntries);
      number = (row?.max ?? 0) + 1;
    }
    let id: string;
    if (draft) {
      await tx
        .update(zukanEntries)
        .set({ ...fields, ...(publish ? { status: "published" as const, number, publishedAt: now } : {}) })
        .where(and(eq(zukanEntries.id, draft.entry.id), eq(zukanEntries.status, "draft")));
      id = draft.entry.id;
      await tx.delete(zukanPhotos).where(eq(zukanPhotos.entryId, id));
    } else {
      const [row] = await tx
        .insert(zukanEntries)
        .values({
          ...fields,
          authorUserId: actor.userId,
          departmentId: primary?.departmentId ?? null,
          locationId: primary?.locationId ?? null,
          status: publish ? "published" : "draft",
          number,
          publishedAt: publish ? now : null,
          postedOn: actor.today,
        })
        .returning({ id: zukanEntries.id });
      id = row.id;
    }
    if (photos.length > 0) await tx.insert(zukanPhotos).values(photos.map((p) => ({ ...p, entryId: id })));
    return { id, number };
  });
  await Promise.all(
    removedKeys.map((k) => deleteObject(k).catch((err) => console.error("[zukan] 写真の削除に失敗しました", err))),
  );
  revalidatePath(BASE, "layout");

  if (publish && saved.number !== null && v.chapter) {
    const number = saved.number;
    const chapter = v.chapter;
    const base = await origin();
    const name = actor.employee?.name ?? actor.loginId;
    const message = [
      `📗 カイゼン図鑑に ${formatNo(number)}「${v.title}」が登録されました【${CHAPTER_LABEL[chapter].label}】`,
      `${name} さん${v.place ? `・${v.place}` : ""}`,
      base ? `${base}${BASE}/${saved.id}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    after(() => sendLineWorksChannelText(process.env.ZUKAN_LINEWORKS_CHANNEL_ID, message).then(() => undefined));
    after(() =>
      noticeNewEntry({ entryId: saved.id, number, chapter, authorUserId: actor.userId, today: actor.today, origin: base }).catch(
        (e) => console.error("[zukan] お知らせを届けられませんでした", e),
      ),
    );
    // AI の下見(失敗しても登録は取り消さない。鑑定する人が自分で付ける)。
    after(() => runAiReview(saved.id).catch((e) => console.error("[zukan] AI の下見に失敗しました", e)));
  }
  return { ok: true, id: saved.id, published: publish };
}

/** AI の下見を作り、ページに保存する。 */
async function runAiReview(entryId: string): Promise<boolean> {
  const entry = await getEntryForAction(entryId);
  if (!entry || entry.status !== "published" || !entry.chapter) return false;
  const photos: AiPhoto[] = await firstPhotosOf(entryId);
  const review = await reviewEntry({
    photos,
    title: entry.title,
    chapter: entry.chapter,
    what: entry.what,
    effect: entry.effect,
    place: entry.place,
  });
  if (!review) return false;
  await db.update(zukanEntries).set({ aiReview: review }).where(eq(zukanEntries.id, entryId));
  return true;
}

// ---- AI で下書き -------------------------------------------------------------------

const DraftAiInput = z
  .object({
    photos: z
      .array(z.object({ kind: z.enum(["before", "after"]), key: z.string().max(300) }).strict())
      .min(1, "写真を 1 枚以上つけてから押してください。")
      .max(PHOTO_MAX_PER_KIND * 2),
    memo: z.string().trim().max(MEMO_MAX, `メモは${MEMO_MAX}文字以内にしてください。`),
  })
  .strict();

/** 写真とひとことのメモから、名前・章・何をしたか・効果の案を返す(保存はしない)。 */
export async function draftAiAction(input: { photos: { kind: PhotoKind; key: string }[]; memo: string }): Promise<DraftResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const parsed = DraftAiInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力を確認してください。" };
  // ビフォー・アフターの 1 枚目だけを見せる(本人の写真か確かめる)。
  const picked = (["before", "after"] as const)
    .map((kind) => parsed.data.photos.find((p) => p.kind === kind))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const photos: AiPhoto[] = [];
  for (const p of picked) {
    const [attached] = await db
      .select({ contentType: zukanPhotos.contentType, entry: zukanEntries })
      .from(zukanPhotos)
      .innerJoin(zukanEntries, eq(zukanEntries.id, zukanPhotos.entryId))
      .where(eq(zukanPhotos.storageKey, p.key))
      .limit(1);
    if (attached) {
      if (attached.entry.authorUserId !== actor.userId) return { error: "写真を付け直してください。" };
      photos.push({ kind: p.kind, storageKey: p.key, contentType: attached.contentType });
      continue;
    }
    const head = await verifyOwnPhoto(actor.userId, p.key);
    if (!head) return { error: "写真の送信が終わっていません。少し待ってから押してください。" };
    photos.push({ kind: p.kind, storageKey: p.key, contentType: head.contentType });
  }
  return draftFromPhotos({ photos, memo: parsed.data.memo });
}

// ---- 鑑定 ------------------------------------------------------------------------

async function loadForWrite(entryId: string) {
  if (!Id.safeParse(entryId).success) return null;
  return getEntryForAction(entryId);
}

const Score = z.number().int().min(CRITERION_MIN).max(CRITERION_MAX);
const AppraiseInput = z
  .object({
    scores: z.object({ effect: Score, idea: Score, reuse: Score, sustain: Score }).strict(),
    comment: z.string().trim().max(APPRAISAL_COMMENT_MAX, `講評は${APPRAISAL_COMMENT_MAX}文字以内にしてください。`),
  })
  .strict();

/** 点数を確定する(鑑定する人だけ)。確定のあとも直せる。監査ログに残し、本人にお知らせを届ける。 */
export async function appraiseAction(
  entryId: string,
  input: { scores: { effect: number; idea: number; reuse: number; sustain: number }; comment: string },
): Promise<ActionResult> {
  const actor = await requireAppAccess(manifest.appKey);
  if (!canAppraise(actor)) return { ok: false, error: "鑑定できません。" };
  const entry = await loadForWrite(entryId);
  if (!entry || entry.status !== "published" || entry.number === null) return { ok: false, error: "ページが見つかりません。" };
  const parsed = AppraiseInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "4 つの観点すべてに 1〜5 の点を付けてください。" };
  const { scores, comment } = parsed.data;
  const score = scoreOf(scores);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(zukanEntries)
      .set({
        scoreEffect: scores.effect,
        scoreIdea: scores.idea,
        scoreReuse: scores.reuse,
        scoreSustain: scores.sustain,
        score,
        appraisalComment: comment,
        appraisedByUserId: actor.userId,
        appraisedAt: now,
      })
      .where(eq(zukanEntries.id, entry.id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "zukan.entry.appraise",
      targetType: "zukan_entry",
      targetId: entry.id,
      before: entry.score === null ? null : { score: entry.score },
      after: { number: entry.number, score, scores, ai: entry.aiReview?.scores ?? null },
    });
  });
  revalidatePath(BASE, "layout");

  const [author] = await db.select({ employeeId: users.employeeId }).from(users).where(eq(users.id, entry.authorUserId)).limit(1);
  const base = await origin();
  const number = entry.number;
  after(() =>
    noticeAppraised({ entryId: entry.id, number, authorEmployeeId: author?.employeeId ?? null, today: actor.today, origin: base }).catch(
      (e) => console.error("[zukan] お知らせを届けられませんでした", e),
    ),
  );
  return { ok: true };
}

/** AI にもう一度下見をしてもらう(鑑定する人だけ)。 */
export async function reviewAgainAction(entryId: string): Promise<ActionResult> {
  const actor = await requireAppAccess(manifest.appKey);
  if (!canAppraise(actor)) return { ok: false, error: "できません。" };
  const entry = await loadForWrite(entryId);
  if (!entry || entry.status !== "published") return { ok: false, error: "ページが見つかりません。" };
  const ok = await runAiReview(entry.id);
  revalidatePath(BASE, "layout");
  return ok ? { ok: true } : { ok: false, error: "AI が下見できませんでした。点数は自分で付けてください。" };
}

/** 本人が鑑定の結果(レア度が開く演出)を見たことを残す。 */
export async function markRevealSeenAction(entryId: string): Promise<void> {
  const actor = await requireAppAccess(manifest.appKey);
  const entry = await loadForWrite(entryId);
  if (!entry || entry.authorUserId !== actor.userId || !entry.appraisedAt) return;
  await db.update(zukanEntries).set({ revealSeenAt: new Date() }).where(eq(zukanEntries.id, entry.id));
  revalidatePath(BASE, "layout");
}

// ---- 反応・コメント ----------------------------------------------------------------

/** 「なるほど!」「まねしたい!」を押す(もう一度押すと取り消し)。 */
export async function toggleReactionAction(entryId: string, kindInput: string): Promise<ActionResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const entry = await loadForWrite(entryId);
  if (!entry || entry.status !== "published") return { ok: false, error: "ページが見つかりません。" };
  const kind = z.enum(REACTION_KINDS).safeParse(kindInput);
  if (!kind.success) return { ok: false, error: "不正なリクエストです。" };
  const where = and(
    eq(zukanReactions.entryId, entry.id),
    eq(zukanReactions.userId, actor.userId),
    eq(zukanReactions.kind, kind.data),
  );
  const removed = await db.delete(zukanReactions).where(where).returning({ kind: zukanReactions.kind });
  if (removed.length === 0) {
    await db.insert(zukanReactions).values({ entryId: entry.id, userId: actor.userId, kind: kind.data }).onConflictDoNothing();
  }
  revalidatePath(`${BASE}/${entry.id}`);
  return { ok: true };
}

const CommentBody = z
  .string()
  .trim()
  .min(1, "コメントを入力してください。")
  .max(COMMENT_MAX, `${COMMENT_MAX}文字以内にしてください。`);

export async function addCommentAction(entryId: string, bodyInput: string): Promise<ActionResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const entry = await loadForWrite(entryId);
  if (!entry || entry.status !== "published" || !canViewEntry(actor, entry)) return { ok: false, error: "ページが見つかりません。" };
  const body = CommentBody.safeParse(bodyInput);
  if (!body.success) return { ok: false, error: body.error.issues[0]?.message ?? "入力を確認してください。" };
  await db.insert(zukanComments).values({ entryId: entry.id, authorUserId: actor.userId, body: body.data });
  revalidatePath(`${BASE}/${entry.id}`);
  return { ok: true };
}

/** コメントを消す(書いた本人か、削除の権限がある人)。 */
export async function deleteCommentAction(commentId: string): Promise<ActionResult> {
  const actor = await requireAppAccess(manifest.appKey);
  if (!Id.safeParse(commentId).success) return { ok: false, error: "不正なリクエストです。" };
  const [comment] = await db.select().from(zukanComments).where(eq(zukanComments.id, commentId)).limit(1);
  if (!comment || (comment.authorUserId !== actor.userId && !canManageEntries(actor))) {
    return { ok: false, error: "コメントが見つかりません。" };
  }
  await db.delete(zukanComments).where(eq(zukanComments.id, comment.id));
  revalidatePath(`${BASE}/${comment.entryId}`);
  return { ok: true };
}

// ---- 削除 ------------------------------------------------------------------------

/** ページを削除する。登録済みは削除の権限がある人だけ(不適切な内容への対応。監査ログに残す)。発見待ちは本人も消せる。 */
export async function deleteEntryAction(entryId: string): Promise<ActionResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const entry = await loadForWrite(entryId);
  if (!entry) return { ok: false, error: "ページが見つかりません。" };
  const ownDraft = entry.status === "draft" && entry.authorUserId === actor.userId;
  if (!ownDraft && !canManageEntries(actor)) return { ok: false, error: "削除できません。" };
  const keys = await photoKeysOf([entry.id]);
  await db.transaction(async (tx) => {
    await tx.delete(zukanEntries).where(eq(zukanEntries.id, entry.id));
    if (!ownDraft) {
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "zukan.entry.delete",
        targetType: "zukan_entry",
        targetId: entry.id,
        before: {
          number: entry.number,
          status: entry.status,
          chapter: entry.chapter,
          authorUserId: entry.authorUserId,
          score: entry.score,
          photoCount: keys.length,
        },
      });
    }
  });
  await Promise.all(keys.map((k) => deleteObject(k).catch((err) => console.error("[zukan] 写真の削除に失敗しました", err))));
  revalidatePath(BASE, "layout");
  return { ok: true };
}
