// 取り込んだ教科書の中身と画像を保存する(コマンドの取り込みと、自動の同期の共通部分)。docs/DESIGN.md 30 章。
// 1. 新しい画像を R2 に保存する(失敗したら、保存した分を消して止める)。
// 2. 中身・画像の記録・ツッコミの付け直し・監査ログを、1 つのトランザクションで入れ替える。
// 3. 使わなくなった画像を R2 から消す(失敗しても、教科書の表示には影響しない)。
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { writeAuditLog } from "@/modules/core/audit";
import { deleteObject, putObject } from "@/modules/core/storage";
import type { BookContent, BookSource } from "./content";
import { IMAGE_TYPES, type ImportResult } from "./import";
import { manifest } from "./manifest";
import { remapAnchors } from "./remap";
import { kyokashoBooks, kyokashoComments, kyokashoImages } from "./schema";

export type BookSettings = {
  department?: string;
  title?: string;
  sourceUrl?: string;
  sortOrder?: number;
};

export type SaveResult = {
  bookId: string;
  created: boolean;
  uploaded: number;
  reused: number;
  removed: number;
  /** R2 から消せなかった古い画像の数。 */
  leftover: number;
  /** 章や節を付け直したツッコミの数。 */
  movedComments: number;
};

/**
 * 教科書の中身を入れ替える(なければ作る。新しい教科書は非公開・見られる人「全員」)。
 * 公開・見られる人などの設定は残し、settings で渡した項目だけ変える。
 */
export async function saveBookContent(input: {
  slug: string;
  result: ImportResult;
  source: Omit<BookSource, "images">;
  /** 実行した人(自動の同期は null)。 */
  actorUserId: string | null;
  settings?: BookSettings;
  /** 監査ログに残す、取り込みのきっかけ(ファイル名、自動の同期など)。 */
  origin: Record<string, unknown>;
  onProgress?: (done: number, total: number) => void;
}): Promise<SaveResult> {
  const { slug, result, settings = {} } = input;
  const [existing] = await db
    .select({ id: kyokashoBooks.id })
    .from(kyokashoBooks)
    .where(eq(kyokashoBooks.slug, slug));
  if (!existing && (!settings.department || !settings.title)) {
    throw new Error("新しい教科書には、まとまり(部署)と題名が必要です。");
  }
  const bookId = existing?.id ?? randomUUID();
  const content: BookContent = { ...result.content, source: { ...input.source, images: result.imageShas } };

  const uploaded: { id: string; storageKey: string; contentType: string; size: number }[] = [];
  let removedKeys: string[] = [];
  let movedComments = 0;
  try {
    for (const [i, image] of result.images.entries()) {
      const storageKey = await putObject({
        appKey: manifest.appKey,
        ownerId: bookId,
        fileName: `image.${IMAGE_TYPES[image.contentType]}`,
        contentType: image.contentType,
        body: image.data,
      });
      uploaded.push({ id: image.id, storageKey, contentType: image.contentType, size: image.data.byteLength });
      input.onProgress?.(i + 1, result.images.length);
    }

    await db.transaction(async (tx) => {
      const keep = new Set(result.reusedImageIds);
      if (existing) {
        // 同じ教科書の同期が重ならないよう、行を押さえてから読む。
        await tx.select({ id: kyokashoBooks.id }).from(kyokashoBooks).where(eq(kyokashoBooks.id, bookId)).for("update");
        const old = await tx
          .select({ id: kyokashoImages.id, storageKey: kyokashoImages.storageKey })
          .from(kyokashoImages)
          .where(eq(kyokashoImages.bookId, bookId));
        const missing = result.reusedImageIds.filter((id) => !old.some((o) => o.id === id));
        if (missing.length) throw new Error("使い回す画像が見つかりません。もう一度取り込んでください。");
        const removed = old.filter((o) => !keep.has(o.id));
        removedKeys = removed.map((o) => o.storageKey);
        await tx
          .update(kyokashoBooks)
          .set({ ...settings, content, importedAt: new Date(), importedBy: input.actorUserId })
          .where(eq(kyokashoBooks.id, bookId));
        if (removed.length) {
          await tx.delete(kyokashoImages).where(
            inArray(
              kyokashoImages.id,
              removed.map((o) => o.id),
            ),
          );
        }
        // 取り込み直しで章や見出しの並びが変わっても、ツッコミが同じ題名の章・節を指すようにする。
        const comments = await tx
          .select({
            id: kyokashoComments.id,
            chapterNo: kyokashoComments.chapterNo,
            chapterTitle: kyokashoComments.chapterTitle,
            sectionId: kyokashoComments.sectionId,
            sectionTitle: kyokashoComments.sectionTitle,
          })
          .from(kyokashoComments)
          .where(eq(kyokashoComments.bookId, bookId));
        for (const u of remapAnchors(content, comments)) {
          await tx
            .update(kyokashoComments)
            .set({ chapterNo: u.chapterNo, sectionId: u.sectionId })
            .where(eq(kyokashoComments.id, u.id));
          movedComments++;
        }
      } else {
        await tx.insert(kyokashoBooks).values({
          id: bookId,
          slug,
          department: settings.department!,
          title: settings.title!,
          sourceUrl: settings.sourceUrl ?? "",
          sortOrder: settings.sortOrder ?? 0,
          content,
          importedBy: input.actorUserId,
        });
      }
      for (let i = 0; i < uploaded.length; i += 200) {
        await tx.insert(kyokashoImages).values(uploaded.slice(i, i + 200).map((u) => ({ ...u, bookId })));
      }
      await writeAuditLog(tx, {
        actorUserId: input.actorUserId,
        action: existing ? "kyokasho.book.reimport" : "kyokasho.book.import",
        targetType: "kyokasho_book",
        targetId: bookId,
        after: {
          slug,
          ...settings,
          ...input.origin,
          format: input.source.format,
          chapters: content.chapters.length,
          images: { added: uploaded.length, reused: keep.size, removed: removedKeys.length },
          movedComments,
        },
      });
    });
  } catch (err) {
    for (const u of uploaded) await deleteObject(u.storageKey).catch(() => undefined);
    throw err;
  }

  let leftover = 0;
  for (const key of removedKeys) {
    await deleteObject(key).catch(() => {
      leftover++;
    });
  }
  return {
    bookId,
    created: !existing,
    uploaded: uploaded.length,
    reused: result.reusedImageIds.length,
    removed: removedKeys.length,
    leftover,
    movedComments,
  };
}
