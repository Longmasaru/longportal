import { asc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { users } from "@/modules/core/auth/schema";
import { employees } from "@/modules/core/employees/schema";
import { createDriveComment, listDriveCommentContents } from "@/modules/core/google";
import { googleDocId } from "./logic";
import { kyokashoBooks, kyokashoComments } from "./schema";
import { googleCommentContent, googleCommentMarker, isCommentKind } from "./tsukkomi";

// これまでのツッコミを、元の Google ドキュメントにコメントとしてまとめて付ける(docs/DESIGN.md 32 章)。
// 新しいツッコミは書いたときに付く(tsukkomi-actions.ts)。ここは、鍵を入れる前のものや、付けられなかったものの取りこぼし用。
// ドキュメントのコメントに「ツッコミ番号」が既にあるものは付けない(何度押しても二重にならない)。

export type GooglePushResult = { added: number; skipped: number; failed: number; books: number };

const authorUser = alias(users, "author_user");
const authorEmp = alias(employees, "author_emp");

export async function pushCommentsToGoogle(origin: string): Promise<GooglePushResult> {
  const result: GooglePushResult = { added: 0, skipped: 0, failed: 0, books: 0 };
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

    let existing: string[];
    try {
      existing = await listDriveCommentContents(docId);
    } catch (err) {
      console.error(`[kyokasho] ${book.slug} のコメントを読めませんでした: ${err instanceof Error ? err.message : "不明"}`);
      result.failed += comments.length;
      continue;
    }
    for (const c of comments) {
      if (existing.some((text) => text.includes(googleCommentMarker(c.id))) || !isCommentKind(c.kind)) {
        result.skipped += 1;
        continue;
      }
      const content = googleCommentContent({
        id: c.id,
        kind: c.kind,
        chapterTitle: c.chapterTitle,
        sectionTitle: c.sectionTitle,
        body: c.body,
        authorName: c.authorName ?? "(退職した人)",
        url: `${origin}/apps/kyokasho/${book.slug}/${c.chapterNo}`,
      });
      try {
        await createDriveComment(docId, content, c.quote || c.sectionTitle || undefined);
        result.added += 1;
      } catch (err) {
        console.error(`[kyokasho] ${book.slug} にコメントを付けられませんでした: ${err instanceof Error ? err.message : "不明"}`);
        result.failed += 1;
      }
    }
  }
  return result;
}
