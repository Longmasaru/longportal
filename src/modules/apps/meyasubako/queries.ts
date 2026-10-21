import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { can, canGlobally, canInAnyScope, type Actor } from "@/modules/core/access";
import { users } from "@/modules/core/auth/schema";
import { departments } from "@/modules/core/departments/schema";
import { employees } from "@/modules/core/employees/schema";
import { locations } from "@/modules/core/locations/schema";
import {
  LEADER_PERMISSION,
  MANAGE_PERMISSION,
  PUBLIC_LIMIT,
  needsResponder,
  postAccess,
  unreadForAuthor,
  type MeyasubakoCategory,
  type MeyasubakoDestination,
  type MeyasubakoStatus,
  type MeyasubakoVisibility,
  type PostAccess,
} from "./constants";
import { meyasubakoMessages, meyasubakoPhotos, meyasubakoPosts } from "./schema";

// 目安箱の読み取り(docs/DESIGN.md 42 章)。見てよいかの判定は postAccess(constants.ts)に集め、
// 一覧・詳細・写真の入口のどれからも同じ判定を通す。匿名の投稿は、本人以外には名前を返さない。

export type PostSummary = {
  id: string;
  category: MeyasubakoCategory;
  destination: MeyasubakoDestination;
  visibility: MeyasubakoVisibility;
  anonymous: boolean;
  status: MeyasubakoStatus;
  place: string;
  body: string;
  photoCount: number;
  messageCount: number;
  /** ISO 8601 */
  createdAt: string;
  /** 出してよいときだけ。匿名なら null。 */
  authorName: string | null;
  /** 投稿した時点の所属(返事をする側にだけ返す)。 */
  departmentName: string | null;
  locationName: string | null;
  needsResponder: boolean;
  unreadForAuthor: boolean;
  isMine: boolean;
};

export type PostMessage = {
  id: string;
  fromResponder: boolean;
  authorName: string;
  body: string;
  /** ISO 8601 */
  createdAt: string;
};

export type PostDetail = PostSummary & {
  photoIds: string[];
  messages: PostMessage[];
  access: PostAccess;
};

/** 全投稿を見られる人か。 */
export function canManagePosts(actor: Actor): boolean {
  return canGlobally(actor, MANAGE_PERMISSION);
}

/** 返事をする側の一覧(受け付けた投稿)を出す人か。 */
export function isResponder(actor: Actor): boolean {
  return canManagePosts(actor) || canInAnyScope(actor, LEADER_PERMISSION);
}

/** その投稿に返事・状況の変更ができるか(管理する人か、リーダー宛てで投稿者の所属が範囲内のリーダー)。 */
export function canRespondTo(
  actor: Actor,
  post: { destination: MeyasubakoDestination; locationId: string | null; departmentId: string | null },
): boolean {
  if (canManagePosts(actor)) return true;
  if (post.destination !== "leader") return false;
  return can(actor, LEADER_PERMISSION, { locationId: post.locationId, departmentId: post.departmentId });
}

const authorEmployee = alias(employees, "author_employee");

const photoCountSql = sql<number>`(select count(*) from ${meyasubakoPhotos} where ${meyasubakoPhotos.postId} = ${meyasubakoPosts.id})::int`;
const messageCountSql = sql<number>`(select count(*) from ${meyasubakoMessages} where ${meyasubakoMessages.postId} = ${meyasubakoPosts.id})::int`;

type PostRow = Awaited<ReturnType<typeof selectPosts>>[number];

function selectPosts(where: SQL | undefined, limit?: number) {
  const q = db
    .select({
      post: meyasubakoPosts,
      authorEmployeeName: authorEmployee.name,
      authorLoginId: users.loginId,
      departmentName: departments.name,
      locationName: locations.name,
      photoCount: photoCountSql,
      messageCount: messageCountSql,
    })
    .from(meyasubakoPosts)
    .innerJoin(users, eq(users.id, meyasubakoPosts.authorUserId))
    .leftJoin(authorEmployee, eq(authorEmployee.id, users.employeeId))
    .leftJoin(departments, eq(departments.id, meyasubakoPosts.departmentId))
    .leftJoin(locations, eq(locations.id, meyasubakoPosts.locationId))
    .where(where)
    .orderBy(desc(meyasubakoPosts.createdAt))
    .$dynamic();
  return limit ? q.limit(limit) : q;
}

function toSummary(actor: Actor, row: PostRow): PostSummary {
  const p = row.post;
  const respond = canRespondTo(actor, p);
  const access = postAccess(p, actor.userId, respond);
  return {
    id: p.id,
    category: p.category,
    destination: p.destination,
    visibility: p.visibility,
    anonymous: p.anonymous,
    status: p.status,
    place: p.place,
    body: p.body,
    photoCount: row.photoCount,
    messageCount: row.messageCount,
    createdAt: p.createdAt.toISOString(),
    authorName: access.showAuthor ? (row.authorEmployeeName ?? row.authorLoginId) : null,
    departmentName: respond && access.showAuthor ? row.departmentName : null,
    locationName: respond && access.showAuthor ? row.locationName : null,
    needsResponder: respond && needsResponder(p),
    unreadForAuthor: access.isAuthor && unreadForAuthor(p),
    isMine: access.isAuthor,
  };
}

/** 自分の投稿(新しい順)。 */
export async function listMyPosts(actor: Actor): Promise<PostSummary[]> {
  const rows = await selectPosts(eq(meyasubakoPosts.authorUserId, actor.userId), 200);
  return rows.map((r) => toSummary(actor, r));
}

/** 「みんなに見えてOK」の投稿(新しい順)。 */
export async function listPublicPosts(actor: Actor): Promise<PostSummary[]> {
  const rows = await selectPosts(eq(meyasubakoPosts.visibility, "public"), PUBLIC_LIMIT);
  return rows.map((r) => toSummary(actor, r));
}

/** 返事をする側の一覧。管理する人は全投稿、リーダーは範囲内のリーダー宛てだけ。返事をする側でなければ空。 */
export async function listInbox(actor: Actor): Promise<PostSummary[]> {
  if (canManagePosts(actor)) return (await selectPosts(undefined, 500)).map((r) => toSummary(actor, r));
  if (!canInAnyScope(actor, LEADER_PERMISSION)) return [];
  const rows = await selectPosts(eq(meyasubakoPosts.destination, "leader"), 500);
  return rows.filter((r) => canRespondTo(actor, r.post)).map((r) => toSummary(actor, r));
}

/** 投稿の詳細。見られない投稿は null(存在しないのと同じ扱い)。 */
export async function getPostDetail(actor: Actor, id: string): Promise<PostDetail | null> {
  const [row] = await selectPosts(eq(meyasubakoPosts.id, id), 1);
  if (!row) return null;
  const summary = toSummary(actor, row);
  const access = postAccess(row.post, actor.userId, canRespondTo(actor, row.post));
  if (!access.view) return null;

  const messageAuthor = alias(employees, "message_author");
  const [photos, messages] = await Promise.all([
    db
      .select({ id: meyasubakoPhotos.id })
      .from(meyasubakoPhotos)
      .where(eq(meyasubakoPhotos.postId, id))
      .orderBy(asc(meyasubakoPhotos.sortOrder), asc(meyasubakoPhotos.createdAt)),
    db
      .select({
        message: meyasubakoMessages,
        employeeName: messageAuthor.name,
        loginId: users.loginId,
      })
      .from(meyasubakoMessages)
      .leftJoin(users, eq(users.id, meyasubakoMessages.authorUserId))
      .leftJoin(messageAuthor, eq(messageAuthor.id, users.employeeId))
      .where(eq(meyasubakoMessages.postId, id))
      .orderBy(asc(meyasubakoMessages.createdAt)),
  ]);

  return {
    ...summary,
    photoIds: photos.map((p) => p.id),
    messages: messages.map((m) => ({
      id: m.message.id,
      fromResponder: m.message.fromResponder,
      // 投稿者の書き足しは、投稿の名前の出し方に合わせる(匿名なら名前を出さない)。
      authorName: m.message.fromResponder
        ? (m.employeeName ?? m.loginId ?? "担当者")
        : summary.authorName ?? "投稿者",
      body: m.message.body,
      createdAt: m.message.createdAt.toISOString(),
    })),
    access,
  };
}

/** 投稿の、判定に要る値だけ(Server Action 用)。 */
export async function getPostForAction(id: string) {
  const [row] = await db.select().from(meyasubakoPosts).where(eq(meyasubakoPosts.id, id)).limit(1);
  return row ?? null;
}

/** 写真の入口用: 見てよい写真なら保存場所を返す。 */
export async function findPhotoForActor(
  actor: Actor,
  photoId: string,
): Promise<{ storageKey: string; contentType: string } | null> {
  const [row] = await db
    .select({ photo: meyasubakoPhotos, post: meyasubakoPosts })
    .from(meyasubakoPhotos)
    .innerJoin(meyasubakoPosts, eq(meyasubakoPosts.id, meyasubakoPhotos.postId))
    .where(eq(meyasubakoPhotos.id, photoId))
    .limit(1);
  if (!row) return null;
  if (!postAccess(row.post, actor.userId, canRespondTo(actor, row.post)).view) return null;
  return { storageKey: row.photo.storageKey, contentType: row.photo.contentType };
}

/** 今日(JST)投稿した数(1 日の上限の判定)。 */
export async function countPostedOn(userId: string, day: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(meyasubakoPosts)
    .where(and(eq(meyasubakoPosts.authorUserId, userId), eq(meyasubakoPosts.postedOn, day)));
  return row?.n ?? 0;
}

/** ホームの要対応に出す数: 返事をする側の未対応と、自分の投稿への未読の返事。 */
export async function countPending(actor: Actor): Promise<{ inbox: number; replies: number }> {
  const [inbox, mine] = await Promise.all([
    isResponder(actor) ? listInbox(actor) : Promise.resolve([]),
    db
      .select({
        responderActivityAt: meyasubakoPosts.responderActivityAt,
        authorReadAt: meyasubakoPosts.authorReadAt,
      })
      .from(meyasubakoPosts)
      .where(eq(meyasubakoPosts.authorUserId, actor.userId)),
  ]);
  return {
    inbox: inbox.filter((p) => p.needsResponder).length,
    replies: mine.filter(unreadForAuthor).length,
  };
}

/** 写真の保存場所(投稿の削除のときに R2 から消すため)。 */
export async function photoKeysOf(postIds: string[]): Promise<string[]> {
  if (postIds.length === 0) return [];
  const rows = await db
    .select({ key: meyasubakoPhotos.storageKey })
    .from(meyasubakoPhotos)
    .where(inArray(meyasubakoPhotos.postId, postIds));
  return rows.map((r) => r.key);
}
