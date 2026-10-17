import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { canGlobally, type Actor } from "@/modules/core/access";
import { users } from "@/modules/core/auth/schema";
import { employees } from "@/modules/core/employees/schema";
import { COMMENTS_PERMISSION, MANAGE_PERMISSION } from "./manifest";
import { listBooksForActor } from "./queries";
import { kyokashoBooks, kyokashoCommentThanks, kyokashoComments } from "./schema";
import { rankContributors, type CommentStatus, type Contributor } from "./tsukkomi";

// ツッコミの読み出し(docs/DESIGN.md 32 章)。読む人には、見られる教科書のツッコミだけを返す。

/** ツッコミに返事をし、採用を決められるか(教科書チーム。教科書を管理する人も含む)。 */
export function canHandleComments(actor: Actor): boolean {
  return canGlobally(actor, COMMENTS_PERMISSION) || canGlobally(actor, MANAGE_PERMISSION);
}

const authorUser = alias(users, "author_user");
const authorEmp = alias(employees, "author_emp");
const replierUser = alias(users, "replier_user");
const replierEmp = alias(employees, "replier_emp");

export type CommentView = {
  id: string;
  bookId: string;
  chapterNo: number;
  chapterTitle: string;
  sectionId: string | null;
  sectionTitle: string;
  quote: string;
  kind: string;
  body: string;
  status: CommentStatus;
  reply: string;
  repliedAt: Date | null;
  repliedByName: string | null;
  authorUserId: string | null;
  authorName: string | null;
  createdAt: Date;
  thanks: { userId: string; name: string }[];
};

const viewColumns = {
  id: kyokashoComments.id,
  bookId: kyokashoComments.bookId,
  chapterNo: kyokashoComments.chapterNo,
  chapterTitle: kyokashoComments.chapterTitle,
  sectionId: kyokashoComments.sectionId,
  sectionTitle: kyokashoComments.sectionTitle,
  quote: kyokashoComments.quote,
  kind: kyokashoComments.kind,
  body: kyokashoComments.body,
  status: sql<CommentStatus>`${kyokashoComments.status}`,
  reply: kyokashoComments.reply,
  repliedAt: kyokashoComments.repliedAt,
  repliedByName: sql<string | null>`coalesce(${replierEmp.name}, ${replierUser.loginId})`,
  authorUserId: kyokashoComments.authorUserId,
  authorName: sql<string | null>`coalesce(${authorEmp.name}, ${authorUser.loginId})`,
  createdAt: kyokashoComments.createdAt,
};

function baseQuery() {
  return db
    .select(viewColumns)
    .from(kyokashoComments)
    .leftJoin(authorUser, eq(kyokashoComments.authorUserId, authorUser.id))
    .leftJoin(authorEmp, eq(authorUser.employeeId, authorEmp.id))
    .leftJoin(replierUser, eq(kyokashoComments.repliedBy, replierUser.id))
    .leftJoin(replierEmp, eq(replierUser.employeeId, replierEmp.id));
}

async function withThanks<T extends { id: string }>(rows: T[]): Promise<(T & { thanks: CommentView["thanks"] })[]> {
  if (rows.length === 0) return [];
  const thanks = await db
    .select({
      commentId: kyokashoCommentThanks.commentId,
      userId: kyokashoCommentThanks.userId,
      name: sql<string>`coalesce(${employees.name}, ${users.loginId})`,
    })
    .from(kyokashoCommentThanks)
    .innerJoin(users, eq(kyokashoCommentThanks.userId, users.id))
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .where(
      inArray(
        kyokashoCommentThanks.commentId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(kyokashoCommentThanks.createdAt));
  const byComment = new Map<string, CommentView["thanks"]>();
  for (const t of thanks) {
    const list = byComment.get(t.commentId) ?? [];
    list.push({ userId: t.userId, name: t.name });
    byComment.set(t.commentId, list);
  }
  return rows.map((r) => ({ ...r, thanks: byComment.get(r.id) ?? [] }));
}

/** 章へのツッコミ(新しい順)。教科書を見られることは、呼び出し側(requireBookForActor)で確かめておく。 */
export async function listChapterComments(bookId: string, chapterNo: number): Promise<CommentView[]> {
  const rows = await baseQuery()
    .where(and(eq(kyokashoComments.bookId, bookId), eq(kyokashoComments.chapterNo, chapterNo)))
    .orderBy(desc(kyokashoComments.createdAt));
  return withThanks(rows);
}

/** 教科書の章ごとのツッコミの数(目次に出す)。 */
export async function countCommentsByChapter(bookId: string): Promise<Map<number, number>> {
  const rows = await db
    .select({ chapterNo: kyokashoComments.chapterNo, n: count() })
    .from(kyokashoComments)
    .where(eq(kyokashoComments.bookId, bookId))
    .groupBy(kyokashoComments.chapterNo);
  return new Map(rows.map((r) => [r.chapterNo, r.n]));
}

export type MyComment = CommentView & { bookSlug: string; bookTitle: string };

/** 一覧のページ用: 見られる教科書の、自分のツッコミ(新しい順)と、教科書をよくしてくれた人。 */
export async function loadTsukkomiOverview(
  actor: Actor,
): Promise<{ mine: MyComment[]; contributors: Contributor[]; openCount: number | null }> {
  const books = await listBooksForActor(actor);
  const handle = canHandleComments(actor);
  if (books.length === 0) return { mine: [], contributors: [], openCount: handle ? 0 : null };
  const bookIds = books.map((b) => b.id);
  const bookById = new Map(books.map((b) => [b.id, b]));

  const [mineRows, all, open] = await Promise.all([
    baseQuery()
      .where(and(inArray(kyokashoComments.bookId, bookIds), eq(kyokashoComments.authorUserId, actor.userId)))
      .orderBy(desc(kyokashoComments.createdAt))
      .limit(5),
    db
      .select({
        authorUserId: kyokashoComments.authorUserId,
        authorName: sql<string | null>`coalesce(${employees.name}, ${users.loginId})`,
        status: kyokashoComments.status,
      })
      .from(kyokashoComments)
      .leftJoin(users, eq(kyokashoComments.authorUserId, users.id))
      .leftJoin(employees, eq(users.employeeId, employees.id))
      .where(inArray(kyokashoComments.bookId, bookIds)),
    handle
      ? db.select({ n: count() }).from(kyokashoComments).where(eq(kyokashoComments.status, "open"))
      : Promise.resolve(null),
  ]);
  const mine = (await withThanks(mineRows)).map((c) => {
    const b = bookById.get(c.bookId);
    return { ...c, bookSlug: b?.slug ?? "", bookTitle: b ? `${b.department} ${b.title}` : "" };
  });
  return { mine, contributors: rankContributors(all), openCount: open ? (open[0]?.n ?? 0) : null };
}

export type AdminComment = CommentView & { bookSlug: string; bookTitle: string };

/** 教科書チームの画面用: 受け止め方で絞ったツッコミ(未対応は古い順、ほかは新しい順)と、受け止め方ごとの数。 */
export async function listCommentsAdmin(
  status: CommentStatus | "all",
): Promise<{ comments: AdminComment[]; counts: Record<string, number> }> {
  const where = status === "all" ? undefined : eq(kyokashoComments.status, status);
  const [rows, counts, books] = await Promise.all([
    baseQuery()
      .where(where)
      .orderBy(status === "open" ? asc(kyokashoComments.createdAt) : desc(kyokashoComments.createdAt))
      .limit(200),
    db
      .select({ status: kyokashoComments.status, n: count() })
      .from(kyokashoComments)
      .groupBy(kyokashoComments.status),
    db
      .select({
        id: kyokashoBooks.id,
        slug: kyokashoBooks.slug,
        department: kyokashoBooks.department,
        title: kyokashoBooks.title,
      })
      .from(kyokashoBooks),
  ]);
  const bookById = new Map(books.map((b) => [b.id, b]));
  const comments = (await withThanks(rows)).map((c) => {
    const b = bookById.get(c.bookId);
    return { ...c, bookSlug: b?.slug ?? "", bookTitle: b ? `${b.department} ${b.title}` : "" };
  });
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const c of counts) {
    byStatus[c.status] = c.n;
    total += c.n;
  }
  byStatus.all = total;
  return { comments, counts: byStatus };
}
