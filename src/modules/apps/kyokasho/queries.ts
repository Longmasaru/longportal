import { asc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { canGlobally, type Actor } from "@/modules/core/access";
import { listAudiences, matchedAudienceIds } from "@/modules/core/audience";
import { canViewBook } from "./logic";
import { MANAGE_PERMISSION } from "./manifest";
import { kyokashoBooks, kyokashoImages, type KyokashoBookRow } from "./schema";

// 教科書の読み出し。入口はページで requireAppAccess("kyokasho") を通したうえで、教科書ごとの見られる人を判定する。

export function canManageBooks(actor: Actor): boolean {
  return canGlobally(actor, MANAGE_PERMISSION);
}

async function matchedFor(actor: Actor, books: { target: string; audienceId: string | null }[]) {
  const ids = books.flatMap((b) => (b.target === "audience" && b.audienceId ? [b.audienceId] : []));
  return matchedAudienceIds(actor.employee?.id ?? null, ids, actor.today);
}

export type BookSummary = {
  id: string;
  slug: string;
  department: string;
  title: string;
  description: string;
  sortOrder: number;
  isPublished: boolean;
  target: string;
  audienceId: string | null;
  sourceUrl: string;
  chapterCount: number;
  importedAt: Date;
};

const summaryColumns = {
  id: kyokashoBooks.id,
  slug: kyokashoBooks.slug,
  department: kyokashoBooks.department,
  title: kyokashoBooks.title,
  description: kyokashoBooks.description,
  sortOrder: kyokashoBooks.sortOrder,
  isPublished: kyokashoBooks.isPublished,
  target: kyokashoBooks.target,
  audienceId: kyokashoBooks.audienceId,
  sourceUrl: kyokashoBooks.sourceUrl,
  chapterCount: sql<number>`coalesce(jsonb_array_length(${kyokashoBooks.content}->'chapters'), 0)`.mapWith(Number),
  importedAt: kyokashoBooks.importedAt,
};

/** 見られる教科書の一覧(中身は含まない)。 */
export async function listBooksForActor(actor: Actor): Promise<BookSummary[]> {
  const rows = await db.select(summaryColumns).from(kyokashoBooks).orderBy(asc(kyokashoBooks.sortOrder));
  const manage = canManageBooks(actor);
  const matched = await matchedFor(actor, rows);
  return rows.filter((r) => canViewBook(r, matched, manage));
}

/** 教科書を 1 冊(中身つき)。見られなければ 404(存在も知らせない)。 */
export async function requireBookForActor(actor: Actor, slug: string): Promise<KyokashoBookRow> {
  const [row] = await db.select().from(kyokashoBooks).where(eq(kyokashoBooks.slug, slug)).limit(1);
  if (!row) notFound();
  const matched = await matchedFor(actor, [row]);
  if (!canViewBook(row, matched, canManageBooks(actor))) notFound();
  return row;
}

/** 画像の保存場所。その画像の教科書を見られる人だけに返す。 */
export async function findImageForActor(
  actor: Actor,
  id: string,
): Promise<{ storageKey: string; contentType: string } | null> {
  const [row] = await db
    .select({
      storageKey: kyokashoImages.storageKey,
      contentType: kyokashoImages.contentType,
      isPublished: kyokashoBooks.isPublished,
      target: kyokashoBooks.target,
      audienceId: kyokashoBooks.audienceId,
    })
    .from(kyokashoImages)
    .innerJoin(kyokashoBooks, eq(kyokashoImages.bookId, kyokashoBooks.id))
    .where(eq(kyokashoImages.id, id))
    .limit(1);
  if (!row) return null;
  const matched = await matchedFor(actor, [row]);
  if (!canViewBook(row, matched, canManageBooks(actor))) return null;
  return { storageKey: row.storageKey, contentType: row.contentType };
}

/** 管理画面用: すべての教科書と、選べる Audience(有効なもの)。 */
export async function listBooksAdmin(): Promise<{ books: BookSummary[]; audiences: { id: string; name: string }[] }> {
  const [books, audiences] = await Promise.all([
    db.select(summaryColumns).from(kyokashoBooks).orderBy(asc(kyokashoBooks.sortOrder)),
    listAudiences(),
  ]);
  return { books, audiences: audiences.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name })) };
}
