// 元の Google ドキュメントとの同期(docs/DESIGN.md 30 章)。毎日の定時(cron.ts)と、管理画面の「今すぐ取り込む」から呼ぶ。
// 教科書のドキュメントは「リンクを知っている全員」に共有されているので、ログインなしの書き出しの URL から読む。
// 1. Word(.docx)で書き出し(図形描画がある文書は、ウェブページ(.zip)も)、ファイルが前回と同じなら何もしない。
// 2. Word で空になった図形描画は、ウェブページの書き出しの同じ順番の画像で埋める(写真は Word の元の大きさのまま)。
// 3. 読み取った中身が前回と同じなら、記録だけ更新する(取り込み日時は変えない)。
// 4. 変わっていれば、取り込み直す(store.ts)。前回と同じ画像は使い回し、ツッコミは同じ題名の章・節に付け直す。
// 元のドキュメントは読むだけで、変えない。
import { createHash } from "node:crypto";
import { asc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import type { BookContent, BookSource } from "./content";
import { imagesAlign, importDocx, importGoogleZip, listGooglePageImages } from "./import";
import { googleDocId } from "./logic";
import { kyokashoBooks } from "./schema";
import { saveBookContent } from "./store";

export type SyncStatus = "updated" | "unchanged" | "skipped" | "error";

export type SyncOutcome = { slug: string; title: string; status: SyncStatus; message: string };

/** 書き出したファイルの大きさの上限(【スタッド】の Word が約 40MB)。 */
const MAX_EXPORT_BYTES = 150 * 1024 * 1024;

export function exportUrl(docId: string, format: "docx" | "zip"): string {
  return `https://docs.google.com/document/d/${docId}/export?format=${format}`;
}

async function download(docId: string, format: "docx" | "zip"): Promise<Buffer> {
  const res = await fetch(exportUrl(docId, format), { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new Error(
      `元のドキュメントを読めませんでした(${res.status})。共有の設定が「リンクを知っている全員」になっているか確認してください。`,
    );
  }
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_EXPORT_BYTES) throw new Error("元のドキュメントが大きすぎます。");
  const data = Buffer.from(await res.arrayBuffer());
  // Word も zip も、ファイルの頭は PK。ログインの画面(HTML)などが返ってきたときは読まない。
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) {
    throw new Error(
      "元のドキュメントを書き出せませんでした。共有の設定が「リンクを知っている全員」になっているか確認してください。",
    );
  }
  return data;
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/** 前回と比べるための sha256(書き出しの形ごとに、読んだファイルから作る)。 */
function combinedSha(format: BookSource["format"], docxSha: string, pageSha: string): string {
  return format === "docx" ? docxSha : format === "zip" ? pageSha : `${docxSha}+${pageSha}`;
}

/** 1 冊を同期する。失敗しても投げずに、結果(status = error)で返す。 */
export async function syncBook(
  bookId: string,
  options: { actorUserId: string | null; trigger: "auto" | "manual" },
): Promise<SyncOutcome> {
  const [book] = await db
    .select({
      id: kyokashoBooks.id,
      slug: kyokashoBooks.slug,
      title: kyokashoBooks.title,
      sourceUrl: kyokashoBooks.sourceUrl,
      content: kyokashoBooks.content,
    })
    .from(kyokashoBooks)
    .where(eq(kyokashoBooks.id, bookId));
  if (!book) return { slug: "", title: "", status: "error", message: "教科書が見つかりません。" };
  const outcome = (status: SyncStatus, message: string): SyncOutcome => ({
    slug: book.slug,
    title: book.title,
    status,
    message,
  });

  const docId = googleDocId(book.sourceUrl);
  if (!docId) return outcome("skipped", "元の Google ドキュメントの URL が登録されていないため、同期していません。");

  try {
    const previous: BookContent["source"] = book.content.source;
    const known = previous?.images ?? {};
    const docx = await download(docId, "docx");
    const docxSha = sha256(docx);
    if (previous?.format === "docx" && previous.sha256 === docxSha) {
      return outcome("unchanged", "元のドキュメントは変わっていません。");
    }
    let page: Buffer | null = null;
    if (previous && previous.format !== "docx") {
      page = await download(docId, "zip");
      if (previous.sha256 === combinedSha(previous.format, docxSha, sha256(page))) {
        return outcome("unchanged", "元のドキュメントは変わっていません。");
      }
    }

    let result = await importDocx(docx, known);
    let format: BookSource["format"] = "docx";
    if (result.blankImages > 0) {
      // Word では図形描画の図が空になる。ウェブページの書き出しの、同じ順番の画像で埋める(写真は Word の元の大きさのまま)。
      // 順番が照らし合わせられないときは、ウェブページの書き出しだけで読む(写真は表示の大きさに縮まる)。
      page ??= await download(docId, "zip");
      const drawings = await listGooglePageImages(page);
      if (imagesAlign(result.imageSizes, drawings.map((d) => d?.size ?? null))) {
        result = await importDocx(docx, known, drawings);
        format = "docx+zip";
      } else {
        result = await importGoogleZip(page, known);
        format = "zip";
      }
    }
    if (result.content.chapters.length === 0) {
      return outcome("error", "章が 1 つも読み取れませんでした。元のドキュメントに見出し 1 があるか確認してください。");
    }
    const source = { format, sha256: combinedSha(format, docxSha, page ? sha256(page) : "") };

    if (
      result.images.length === 0 &&
      JSON.stringify(result.content.chapters) === JSON.stringify(book.content.chapters)
    ) {
      // 書き出しのファイルだけが変わり、中身は同じ(次からはファイルの比べだけで済むよう、記録だけ更新する)。
      await db
        .update(kyokashoBooks)
        .set({ content: { ...result.content, source: { ...source, images: result.imageShas } } })
        .where(eq(kyokashoBooks.id, book.id));
      return outcome("unchanged", "元のドキュメントの中身は変わっていません。");
    }

    const saved = await saveBookContent({
      slug: book.slug,
      result,
      source,
      actorUserId: options.actorUserId,
      origin: { trigger: options.trigger, from: "google-docs" },
    });
    const parts = [
      `取り込み直しました(全 ${result.content.chapters.length} 章`,
      saved.uploaded ? `・新しい画像 ${saved.uploaded} 個` : "",
      saved.movedComments ? `・ツッコミ ${saved.movedComments} 件の位置を付け直し` : "",
      ")。",
    ];
    return outcome("updated", parts.join(""));
  } catch (err) {
    return outcome("error", err instanceof Error ? err.message : "同期に失敗しました。");
  }
}

/**
 * 元の URL がある教科書を、取り込みの古い順に同期する。deadline を過ぎたら、残りは次の回に回す。
 */
export async function syncAllBooks(options: { deadline: number }): Promise<SyncOutcome[]> {
  const books = await db
    .select({ id: kyokashoBooks.id, slug: kyokashoBooks.slug, title: kyokashoBooks.title })
    .from(kyokashoBooks)
    .where(ne(kyokashoBooks.sourceUrl, ""))
    .orderBy(asc(kyokashoBooks.importedAt));
  const outcomes: SyncOutcome[] = [];
  for (const book of books) {
    if (Date.now() > options.deadline) {
      outcomes.push({ slug: book.slug, title: book.title, status: "skipped", message: "時間切れのため、次の回に回します。" });
      continue;
    }
    outcomes.push(await syncBook(book.id, { actorUserId: null, trigger: "auto" }));
  }
  return outcomes;
}
