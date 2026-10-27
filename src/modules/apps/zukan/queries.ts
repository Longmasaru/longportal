import { and, asc, count, eq, gte, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { canGlobally, type Actor } from "@/modules/core/access";
import { users } from "@/modules/core/auth/schema";
import { departments } from "@/modules/core/departments/schema";
import { employees } from "@/modules/core/employees/schema";
import { locations } from "@/modules/core/locations/schema";
import {
  APPRAISE_PERMISSION,
  LIST_LIMIT,
  MANAGE_PERMISSION,
  REACTION_KINDS,
  ZUKAN_CHAPTERS,
  rarityOf,
  unseenReveal,
  type AiReview,
  type CriterionScores,
  type PhotoKind,
  type Rarity,
  type ReactionKind,
  type ZukanChapter,
  type ZukanStatus,
} from "./constants";
import { zukanComments, zukanEntries, zukanPhotos, zukanReactions } from "./schema";

// カイゼン図鑑の読み取り(docs/DESIGN.md 44 章)。登録済みのページは、アプリを使える人なら誰でも見られる。
// 発見待ち(下書き)は本人だけ。AI の下見は、鑑定ができる人にだけ返す。

export type EntrySummary = {
  id: string;
  number: number | null;
  status: ZukanStatus;
  title: string;
  chapter: ZukanChapter | null;
  place: string;
  score: number | null;
  rarity: Rarity | null;
  authorName: string;
  departmentName: string | null;
  locationName: string | null;
  /** ISO 8601。発見待ちは保存した日時。 */
  at: string;
  beforePhotoId: string | null;
  afterPhotoId: string | null;
  reactionCount: number;
  commentCount: number;
  isMine: boolean;
  /** 本人に、まだ見ていない鑑定の結果がある。 */
  unseenReveal: boolean;
};

export type EntryComment = {
  id: string;
  authorName: string;
  body: string;
  /** ISO 8601 */
  createdAt: string;
  isMine: boolean;
};

export type EntryAccess = {
  isAuthor: boolean;
  appraise: boolean;
  manage: boolean;
};

export type EntryDetail = EntrySummary & {
  what: string;
  effect: string;
  photos: { id: string; kind: PhotoKind }[];
  criteria: CriterionScores | null;
  appraisalComment: string;
  appraiserName: string | null;
  /** ISO 8601 */
  appraisedAt: string | null;
  reactions: Record<ReactionKind, { count: number; mine: boolean }>;
  comments: EntryComment[];
  /** 鑑定ができる人にだけ返す。 */
  aiReview: AiReview | null;
  access: EntryAccess;
};

export function canAppraise(actor: Actor): boolean {
  return canGlobally(actor, APPRAISE_PERMISSION);
}

export function canManageEntries(actor: Actor): boolean {
  return canGlobally(actor, MANAGE_PERMISSION);
}

/** そのページを見てよいか(登録済みなら誰でも。発見待ちは本人だけ)。 */
export function canViewEntry(actor: Actor, entry: { status: ZukanStatus; authorUserId: string }): boolean {
  return entry.status === "published" || entry.authorUserId === actor.userId;
}

const authorEmployee = alias(employees, "author_employee");

const firstPhotoSql = (kind: PhotoKind) =>
  sql<string | null>`(select ${zukanPhotos.id} from ${zukanPhotos} where ${zukanPhotos.entryId} = ${zukanEntries.id} and ${zukanPhotos.kind} = ${kind} order by ${zukanPhotos.sortOrder}, ${zukanPhotos.createdAt} limit 1)`;
const reactionCountSql = sql<number>`(select count(*) from ${zukanReactions} where ${zukanReactions.entryId} = ${zukanEntries.id})::int`;
const commentCountSql = sql<number>`(select count(*) from ${zukanComments} where ${zukanComments.entryId} = ${zukanEntries.id})::int`;

type EntryRow = Awaited<ReturnType<typeof selectEntries>>[number];

function selectEntries(where: SQL | undefined, order: "newest" | "oldest", limit?: number) {
  const q = db
    .select({
      entry: zukanEntries,
      authorEmployeeName: authorEmployee.name,
      authorLoginId: users.loginId,
      departmentName: departments.name,
      locationName: locations.name,
      beforePhotoId: firstPhotoSql("before"),
      afterPhotoId: firstPhotoSql("after"),
      reactionCount: reactionCountSql,
      commentCount: commentCountSql,
    })
    .from(zukanEntries)
    .innerJoin(users, eq(users.id, zukanEntries.authorUserId))
    .leftJoin(authorEmployee, eq(authorEmployee.id, users.employeeId))
    .leftJoin(departments, eq(departments.id, zukanEntries.departmentId))
    .leftJoin(locations, eq(locations.id, zukanEntries.locationId))
    .where(where)
    .orderBy(
      order === "newest"
        ? sql`coalesce(${zukanEntries.publishedAt}, ${zukanEntries.createdAt}) desc`
        : sql`coalesce(${zukanEntries.publishedAt}, ${zukanEntries.createdAt}) asc`,
    )
    .$dynamic();
  return limit ? q.limit(limit) : q;
}

function toSummary(actor: Actor, row: EntryRow): EntrySummary {
  const e = row.entry;
  const isMine = e.authorUserId === actor.userId;
  return {
    id: e.id,
    number: e.number,
    status: e.status,
    title: e.title,
    chapter: e.chapter,
    place: e.place,
    score: e.score,
    rarity: rarityOf(e.score),
    authorName: row.authorEmployeeName ?? row.authorLoginId,
    departmentName: row.departmentName,
    locationName: row.locationName,
    at: (e.publishedAt ?? e.createdAt).toISOString(),
    beforePhotoId: row.beforePhotoId,
    afterPhotoId: row.afterPhotoId,
    reactionCount: row.reactionCount,
    commentCount: row.commentCount,
    isMine,
    unseenReveal: isMine && unseenReveal(e),
  };
}

/** 図鑑の一覧(登録済み。新しい順)。章で絞り込める。 */
export async function listPublished(actor: Actor, chapter: ZukanChapter | null): Promise<EntrySummary[]> {
  const where = and(
    eq(zukanEntries.status, "published"),
    chapter ? eq(zukanEntries.chapter, chapter) : undefined,
  );
  const rows = await selectEntries(where, "newest", LIST_LIMIT);
  return rows.map((r) => toSummary(actor, r));
}

/** 表紙の数字: 登録の総数、今月(JST)の登録数、章ごとの数。 */
export async function coverStats(today: string): Promise<{
  total: number;
  thisMonth: number;
  byChapter: Record<ZukanChapter, number>;
}> {
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00+09:00`);
  const [rows, [month]] = await Promise.all([
    db
      .select({ chapter: zukanEntries.chapter, n: count() })
      .from(zukanEntries)
      .where(eq(zukanEntries.status, "published"))
      .groupBy(zukanEntries.chapter),
    db
      .select({ n: count() })
      .from(zukanEntries)
      .where(and(eq(zukanEntries.status, "published"), gte(zukanEntries.publishedAt, monthStart))),
  ]);
  const byChapter = Object.fromEntries(ZUKAN_CHAPTERS.map((c) => [c, 0])) as Record<ZukanChapter, number>;
  let total = 0;
  for (const r of rows) {
    if (r.chapter) byChapter[r.chapter] = r.n;
    total += r.n;
  }
  return { total, thisMonth: month?.n ?? 0, byChapter };
}

/** 自分のページ(発見待ちを含む。新しい順)。 */
export async function listMine(actor: Actor): Promise<EntrySummary[]> {
  const rows = await selectEntries(eq(zukanEntries.authorUserId, actor.userId), "newest", 500);
  return rows.map((r) => toSummary(actor, r));
}

/** 鑑定待ち(登録済みで点数が未確定。古い順)。鑑定ができない人には空。 */
export async function listAppraiseQueue(actor: Actor): Promise<(EntrySummary & { aiReview: AiReview | null })[]> {
  if (!canAppraise(actor)) return [];
  const rows = await selectEntries(
    and(eq(zukanEntries.status, "published"), isNull(zukanEntries.appraisedAt)),
    "oldest",
    500,
  );
  return rows.map((r) => ({ ...toSummary(actor, r), aiReview: r.entry.aiReview }));
}

/** ページの詳細。見られないページは null(存在しないのと同じ扱い)。 */
export async function getEntryDetail(actor: Actor, id: string): Promise<EntryDetail | null> {
  const [row] = await selectEntries(eq(zukanEntries.id, id), "newest", 1);
  if (!row || !canViewEntry(actor, row.entry)) return null;
  const e = row.entry;
  const appraise = canAppraise(actor);

  const commentAuthor = alias(employees, "comment_author");
  const appraiser = alias(users, "appraiser");
  const appraiserEmployee = alias(employees, "appraiser_employee");
  const [photos, reactions, comments, appraiserRow] = await Promise.all([
    db
      .select({ id: zukanPhotos.id, kind: zukanPhotos.kind })
      .from(zukanPhotos)
      .where(eq(zukanPhotos.entryId, id))
      .orderBy(asc(zukanPhotos.sortOrder), asc(zukanPhotos.createdAt)),
    db
      .select({ kind: zukanReactions.kind, userId: zukanReactions.userId })
      .from(zukanReactions)
      .where(eq(zukanReactions.entryId, id)),
    db
      .select({
        comment: zukanComments,
        employeeName: commentAuthor.name,
        loginId: users.loginId,
      })
      .from(zukanComments)
      .leftJoin(users, eq(users.id, zukanComments.authorUserId))
      .leftJoin(commentAuthor, eq(commentAuthor.id, users.employeeId))
      .where(eq(zukanComments.entryId, id))
      .orderBy(asc(zukanComments.createdAt)),
    e.appraisedByUserId
      ? db
          .select({ name: appraiserEmployee.name, loginId: appraiser.loginId })
          .from(appraiser)
          .leftJoin(appraiserEmployee, eq(appraiserEmployee.id, appraiser.employeeId))
          .where(eq(appraiser.id, e.appraisedByUserId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const reactionSummary = Object.fromEntries(
    REACTION_KINDS.map((k) => {
      const of = reactions.filter((r) => r.kind === k);
      return [k, { count: of.length, mine: of.some((r) => r.userId === actor.userId) }];
    }),
  ) as EntryDetail["reactions"];

  const criteria =
    e.scoreEffect !== null && e.scoreIdea !== null && e.scoreReuse !== null && e.scoreSustain !== null
      ? { effect: e.scoreEffect, idea: e.scoreIdea, reuse: e.scoreReuse, sustain: e.scoreSustain }
      : null;

  return {
    ...toSummary(actor, row),
    what: e.what,
    effect: e.effect,
    photos,
    criteria,
    appraisalComment: e.appraisalComment,
    appraiserName: appraiserRow[0] ? (appraiserRow[0].name ?? appraiserRow[0].loginId) : null,
    appraisedAt: e.appraisedAt?.toISOString() ?? null,
    reactions: reactionSummary,
    comments: comments.map((c) => ({
      id: c.comment.id,
      authorName: c.employeeName ?? c.loginId ?? "退職した人",
      body: c.comment.body,
      createdAt: c.comment.createdAt.toISOString(),
      isMine: c.comment.authorUserId === actor.userId,
    })),
    aiReview: appraise ? e.aiReview : null,
    access: { isAuthor: e.authorUserId === actor.userId, appraise, manage: canManageEntries(actor) },
  };
}

/** 発見待ちの続き(本人の下書きだけ)。写真は保存場所つきで返す(登録のときに送り直さないため)。 */
export async function getDraftForEdit(actor: Actor, id: string) {
  const [entry] = await db
    .select()
    .from(zukanEntries)
    .where(and(eq(zukanEntries.id, id), eq(zukanEntries.authorUserId, actor.userId), eq(zukanEntries.status, "draft")))
    .limit(1);
  if (!entry) return null;
  const photos = await db
    .select({ id: zukanPhotos.id, kind: zukanPhotos.kind, storageKey: zukanPhotos.storageKey })
    .from(zukanPhotos)
    .where(eq(zukanPhotos.entryId, id))
    .orderBy(asc(zukanPhotos.sortOrder), asc(zukanPhotos.createdAt));
  return { entry, photos };
}

/** ページの、判定に要る値(Server Action 用)。 */
export async function getEntryForAction(id: string) {
  const [row] = await db.select().from(zukanEntries).where(eq(zukanEntries.id, id)).limit(1);
  return row ?? null;
}

/** AI の下見に渡す写真(ビフォー・アフターの 1 枚目)。 */
export async function firstPhotosOf(entryId: string): Promise<{ kind: PhotoKind; storageKey: string; contentType: string }[]> {
  const rows = await db
    .select({ kind: zukanPhotos.kind, storageKey: zukanPhotos.storageKey, contentType: zukanPhotos.contentType })
    .from(zukanPhotos)
    .where(eq(zukanPhotos.entryId, entryId))
    .orderBy(asc(zukanPhotos.sortOrder), asc(zukanPhotos.createdAt));
  const before = rows.find((r) => r.kind === "before");
  const after = rows.find((r) => r.kind === "after");
  return [before, after].filter((r): r is NonNullable<typeof r> => Boolean(r));
}

/** 写真の入口用: 見てよい写真なら保存場所を返す。 */
export async function findPhotoForActor(
  actor: Actor,
  photoId: string,
): Promise<{ storageKey: string; contentType: string } | null> {
  const [row] = await db
    .select({ photo: zukanPhotos, entry: zukanEntries })
    .from(zukanPhotos)
    .innerJoin(zukanEntries, eq(zukanEntries.id, zukanPhotos.entryId))
    .where(eq(zukanPhotos.id, photoId))
    .limit(1);
  if (!row || !canViewEntry(actor, row.entry)) return null;
  return { storageKey: row.photo.storageKey, contentType: row.photo.contentType };
}

/** 今日(JST)保存した数(1 日の上限の判定)。 */
export async function countPostedOn(userId: string, day: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(zukanEntries)
    .where(and(eq(zukanEntries.authorUserId, userId), eq(zukanEntries.postedOn, day)));
  return row?.n ?? 0;
}

/** ホームの要対応に出す数: 鑑定待ち(鑑定する人)と、まだ見ていない自分の鑑定の結果。 */
export async function countPending(actor: Actor): Promise<{ queue: number; reveals: number }> {
  const [queue, mine] = await Promise.all([
    canAppraise(actor)
      ? db
          .select({ n: count() })
          .from(zukanEntries)
          .where(and(eq(zukanEntries.status, "published"), isNull(zukanEntries.appraisedAt)))
          .then((r) => r[0]?.n ?? 0)
      : Promise.resolve(0),
    db
      .select({ appraisedAt: zukanEntries.appraisedAt, revealSeenAt: zukanEntries.revealSeenAt })
      .from(zukanEntries)
      .where(eq(zukanEntries.authorUserId, actor.userId)),
  ]);
  return { queue, reveals: mine.filter(unseenReveal).length };
}

/** 写真の保存場所(ページの削除のときに R2 から消すため)。 */
export async function photoKeysOf(entryIds: string[]): Promise<string[]> {
  if (entryIds.length === 0) return [];
  const rows = await db
    .select({ key: zukanPhotos.storageKey })
    .from(zukanPhotos)
    .where(inArray(zukanPhotos.entryId, entryIds));
  return rows.map((r) => r.key);
}

