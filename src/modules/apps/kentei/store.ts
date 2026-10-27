// 取り込んだ試験の中身と画像を保存する(scripts/import-kentei.ts から使う)。docs/DESIGN.md 43 章。
// 1. 新しい画像を R2 に保存する(前回と同じ名前・同じ中身の画像は使い回す。失敗したら、保存した分を消して止める)。
// 2. 中身・画像の記録・監査ログを、1 つのトランザクションで入れ替える。
// 3. 使わなくなった画像を R2 から消す(失敗しても、練習には影響しない)。
// 練習の記録(kentei.answers / test_results)は問題の id でつながるので、取り込み直しても残る。
import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { writeAuditLog } from "@/modules/core/audit";
import { deleteObject, putObject } from "@/modules/core/storage";
import { imageRefs, replaceImageRefs, type ExamContent } from "./content";
import { manifest } from "./manifest";
import { kenteiExams, kenteiImages } from "./schema";

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type ExamImage = { name: string; contentType: string; data: Uint8Array };

export type ExamSettings = {
  title: string;
  grade: string;
  titleVi: string;
  sortOrder: number;
};

export type SaveExamResult = {
  examId: string;
  created: boolean;
  uploaded: number;
  reused: number;
  removed: number;
  leftover: number;
};

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** 試験を作る(なければ)か、中身を入れ替える。publish が true なら公開にする(false でも、公開中の試験は公開のまま)。 */
export async function saveExam(input: {
  slug: string;
  settings: ExamSettings;
  /** 画像はファイル名で書いた中身。 */
  content: ExamContent;
  images: readonly ExamImage[];
  actorUserId: string;
  publish: boolean;
  origin: Record<string, unknown>;
}): Promise<SaveExamResult> {
  const refs = imageRefs(input.content);
  const byName = new Map(input.images.map((i) => [i.name, i]));
  for (const ref of refs) {
    const image = byName.get(ref);
    if (!image) throw new Error(`画像のファイルがありません: ${ref}`);
    if (!IMAGE_TYPES[image.contentType]) throw new Error(`使えない画像の形式です: ${ref}`);
  }

  const [existing] = await db.select({ id: kenteiExams.id }).from(kenteiExams).where(eq(kenteiExams.slug, input.slug));
  const examId = existing?.id ?? randomUUID();
  const old = existing
    ? await db
        .select({
          id: kenteiImages.id,
          name: kenteiImages.name,
          sha256: kenteiImages.sha256,
          storageKey: kenteiImages.storageKey,
        })
        .from(kenteiImages)
        .where(eq(kenteiImages.examId, examId))
    : [];

  const idOf = new Map<string, string>();
  const keep = new Set<string>();
  const uploaded: {
    id: string;
    name: string;
    sha256: string;
    storageKey: string;
    contentType: string;
    size: number;
  }[] = [];
  let removed: typeof old = [];
  try {
    for (const ref of refs) {
      const image = byName.get(ref)!;
      const hash = sha256(image.data);
      const same = old.find((o) => o.name === ref && o.sha256 === hash);
      if (same) {
        idOf.set(ref, same.id);
        keep.add(same.id);
        continue;
      }
      const storageKey = await putObject({
        appKey: manifest.appKey,
        ownerId: examId,
        fileName: `image.${IMAGE_TYPES[image.contentType]}`,
        contentType: image.contentType,
        body: image.data,
      });
      const id = randomUUID();
      uploaded.push({
        id,
        name: ref,
        sha256: hash,
        storageKey,
        contentType: image.contentType,
        size: image.data.byteLength,
      });
      idOf.set(ref, id);
    }
    const content = replaceImageRefs(input.content, idOf);
    removed = old.filter((o) => !keep.has(o.id));

    await db.transaction(async (tx) => {
      if (existing) {
        await tx
          .update(kenteiExams)
          .set({
            ...input.settings,
            content,
            importedAt: new Date(),
            importedBy: input.actorUserId,
            ...(input.publish ? { isPublished: true } : {}),
          })
          .where(eq(kenteiExams.id, examId));
        if (removed.length) {
          await tx.delete(kenteiImages).where(
            inArray(
              kenteiImages.id,
              removed.map((o) => o.id),
            ),
          );
        }
      } else {
        await tx.insert(kenteiExams).values({
          id: examId,
          slug: input.slug,
          ...input.settings,
          content,
          isPublished: input.publish,
          importedBy: input.actorUserId,
        });
      }
      if (uploaded.length) await tx.insert(kenteiImages).values(uploaded.map((u) => ({ ...u, examId })));
      await writeAuditLog(tx, {
        actorUserId: input.actorUserId,
        action: existing ? "kentei.exam.reimport" : "kentei.exam.import",
        targetType: "kentei_exam",
        targetId: examId,
        after: {
          slug: input.slug,
          ...input.settings,
          ...input.origin,
          questions: content.questions.length,
          glossary: content.glossary.length,
          practical: content.practical !== null,
          images: {
            added: uploaded.length,
            reused: keep.size,
            removed: removed.length,
          },
          ...(input.publish ? { isPublished: true } : {}),
        },
      });
    });
  } catch (err) {
    for (const u of uploaded) await deleteObject(u.storageKey).catch(() => undefined);
    throw err;
  }

  let leftover = 0;
  for (const o of removed) {
    await deleteObject(o.storageKey).catch(() => {
      leftover++;
    });
  }
  return {
    examId,
    created: !existing,
    uploaded: uploaded.length,
    reused: keep.size,
    removed: removed.length,
    leftover,
  };
}
