import { asc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { users } from "@/modules/core/auth/schema";
import { employees } from "@/modules/core/employees/schema";
import { createDriveComment, deleteDriveComment, listDriveComments, type DriveComment } from "@/modules/core/google";
import { googleDocId } from "./logic";
import { kyokashoBooks, kyokashoComments } from "./schema";
import { googleCommentContent, googleCommentMarker, isCommentKind } from "./tsukkomi";

// これまでのツッコミを、元の Google ドキュメントにコメントとしてまとめて付ける(docs/DESIGN.md 32 章)。
// 新しいツッコミは書いたときに付く(tsukkomi-actions.ts)。ここは、鍵を入れる前のものや、付けられなかったものの取りこぼし用。
// ドキュメントのコメントに「ツッコミ番号」が既にあるものは付けない(何度押しても二重にならない)。
// ポータルが前に付けたもので、本文の形が今と違うもの(引用つきの古い形など)は、消して付け直す。

export type GooglePushResult = { added: number; replaced: number; skipped: number; failed: number; books: number };

const authorUser = alias(users, "author_user");
const authorEmp = alias(employees, "author_emp");

export async function pushCommentsToGoogle(origin: string): Promise<GooglePushResult> {
  const result: GooglePushResult = { added: 0, replaced: 0, skipped: 0, failed: 0, books: 0 };
  const books = await db
    .select({ id: kyokashoBooks.id, slug: kyokashoBooks.slug, sourceUrl: kyokashoBooks.sourceUrl })
    .from(kyokashoBooks)
    .where(ne(kyokashoBooks.sourceUrl, ""));

  for (const book of books) {
    const docId = googleDocId(book.sourceUrl);
    if (!docId) continue;
    const comments = await db
      .select({
        id: kyokashoComments.id,
        chapterNo: kyokashoComments.chapterNo,
        chapterTitle: kyokashoComments.chapterTitle,
        sectionTitle: kyokashoComments.sectionTitle,
        quote: kyokashoComments.quote,
        kind: kyokashoComments.kind,
        body: kyokashoComments.body,
        authorName: sql<string | null>`coalesce(${authorEmp.name}, ${authorUser.loginId})`,
      })
      .from(kyokashoComments)
      .leftJoin(authorUser, eq(kyokashoComments.authorUserId, authorUser.id))
      .leftJoin(authorEmp, eq(authorUser.employeeId, authorEmp.id))
      .where(eq(kyokashoComments.bookId, book.id))
      .orderBy(asc(kyokashoComments.createdAt));
    if (comments.length === 0) continue;
    result.books += 1;

    let existing: DriveComment[];
    try {
      existing = await listDriveComments(docId);
    } catch (err) {
      console.error(`[kyokasho] ${book.slug} のコメントを読めませんでした: ${err instanceof Error ? err.message : "不明"}`);
      result.failed += comments.length;
      continue;
    }
    for (const c of comments) {
      if (!isCommentKind(c.kind)) {
        result.skipped += 1;
        continue;
      }
      const content = googleCommentContent({
        id: c.id,
        kind: c.kind,
        chapterTitle: c.chapterTitle,
        sectionTitle: c.sectionTitle,
        quote: c.quote,
        body: c.body,
        authorName: c.authorName ?? "(退職した人)",
        url: `${origin}/apps/kyokasho/${book.slug}/${c.chapterNo}`,
      });
      const marker = googleCommentMarker(c.id);
      const found = existing.filter((e) => e.content.includes(marker));
      const stale = found.filter((e) => e.mine && (e.quoted || e.content.trim() !== content.trim()));
      if (found.length > stale.length) {
        result.skipped += 1;
        continue;
      }
      try {
        for (const e of stale) await deleteDriveComment(docId, e.id);
        await createDriveComment(docId, content);
        if (stale.length > 0) result.replaced += 1;
        else result.added += 1;
      } catch (err) {
        console.error(`[kyokasho] ${book.slug} にコメントを付けられませんでした: ${err instanceof Error ? err.message : "不明"}`);
        result.failed += 1;
      }
    }
  }
  return result;
}
