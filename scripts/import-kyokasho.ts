// ロングの教科書の取り込み(docs/DESIGN.md 30 章)。
// Google ドキュメントを「ファイル → ダウンロード → Microsoft Word(.docx)」で保存したファイルを渡す。
// 元の Google ドキュメントは読むだけで、変えない。教科書の中身はリポジトリに入れない(社内の情報のため)。
//
// 実行(既定は確認だけで、DB にも R2 にも書き込まない):
//   npm run db:import-kyokasho -- <ファイル.docx> --slug <URL の名前> --actor <ログインID> \
//     [--department <まとまり>] [--title <題名>] [--source-url <元のドキュメントの URL>] [--sort <並び順>] [--apply]
// 新しい教科書は --department と --title が必要で、非公開・見られる人「全員」で作る(公開は /apps/kyokasho/manage で)。
// 同じ --slug の教科書があれば、中身と画像だけを入れ替える(公開・見られる人などの設定は残す。指定した項目だけ変える)。
// --preview <ファイル.json> で、読み取った中身を JSON に書き出せる(確認用。リポジトリの外に置くこと)。
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { collectImageIds, countQuizQuestions, type BookContent } from "../src/modules/apps/kyokasho/content";
import { IMAGE_TYPES, importDocx } from "../src/modules/apps/kyokasho/import";
import { isValidSlug } from "../src/modules/apps/kyokasho/logic";
import { manifest } from "../src/modules/apps/kyokasho/manifest";
import { kyokashoBooks, kyokashoImages } from "../src/modules/apps/kyokasho/schema";
import { writeAuditLog } from "../src/modules/core/audit";
import { users } from "../src/modules/core/auth/schema";
import { deleteObject, putObject } from "../src/modules/core/storage";
import { assertTarget } from "./guard";

type Args = {
  file: string;
  slug: string;
  actorLoginId: string;
  department?: string;
  title?: string;
  sourceUrl?: string;
  sortOrder?: number;
  preview?: string;
  apply: boolean;
};

const USAGE =
  "使い方: npm run db:import-kyokasho -- <ファイル.docx> --slug <URL の名前> --actor <ログインID> " +
  "[--department <まとまり>] [--title <題名>] [--source-url <URL>] [--sort <並び順>] [--preview <ファイル.json>] [--apply]";

function parseArgs(argv: string[]): Args {
  const rest: string[] = [];
  const args: Omit<Args, "file"> = { slug: "", actorLoginId: "", apply: false };
  const value = (i: number) => {
    const v = argv[i];
    if (v === undefined || v.startsWith("--")) throw new Error(USAGE);
    return v.trim();
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--slug") args.slug = value(++i);
    else if (a === "--actor") args.actorLoginId = value(++i).toLowerCase();
    else if (a === "--department") args.department = value(++i);
    else if (a === "--title") args.title = value(++i);
    else if (a === "--source-url") args.sourceUrl = value(++i);
    else if (a === "--preview") args.preview = value(++i);
    else if (a === "--sort") {
      const n = Number(value(++i));
      if (!Number.isInteger(n) || n < 0 || n > 9999) throw new Error("--sort は 0〜9999 の整数にしてください。");
      args.sortOrder = n;
    } else rest.push(a);
  }
  if (rest.length !== 1 || !args.slug || !args.actorLoginId) throw new Error(USAGE);
  if (!isValidSlug(args.slug)) {
    throw new Error("--slug は半角の小文字・数字・-(例: brake-basic)にしてください(images・manage・new は使えません)。");
  }
  if (args.department !== undefined && (!args.department || args.department.length > 40)) {
    throw new Error("--department は 1〜40 文字にしてください。");
  }
  if (args.title !== undefined && (!args.title || args.title.length > 80)) {
    throw new Error("--title は 1〜80 文字にしてください。");
  }
  if (args.sourceUrl !== undefined && !/^https:\/\//.test(args.sourceUrl)) {
    throw new Error("--source-url は https:// で始まる URL にしてください。");
  }
  return { file: rest[0], ...args };
}

function summarize(content: BookContent): void {
  for (const [i, ch] of content.chapters.entries()) {
    const images = collectImageIds(ch.blocks).length;
    const quiz = countQuizQuestions(ch);
    const sections = ch.blocks.filter((b) => b.type === "heading" && b.level === 2).length;
    console.log(
      `  ${String(i + 1).padStart(2)}. ${ch.title}(節 ${sections}・部品 ${ch.blocks.length}・画像 ${images}${quiz ? `・テスト ${quiz} 問` : ""})`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await importDocx(readFileSync(args.file));
  const { content, images, warnings } = result;
  const totalBytes = images.reduce((n, i) => n + i.data.byteLength, 0);
  console.log(`[import-kyokasho] ${args.file}`);
  console.log(`  章 ${content.chapters.length}・画像 ${images.length} 個(${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
  summarize(content);
  for (const w of warnings) console.log(`  - 注意: ${w}`);
  if (args.preview) {
    writeFileSync(args.preview, JSON.stringify(content, null, 2));
    console.log(`  読み取った中身を ${args.preview} に書き出しました。`);
  }
  if (content.chapters.length === 0) throw new Error("章が 1 つも読み取れませんでした。見出し 1 があるか確認してください。");
  if (!args.apply) {
    console.log("確認だけで終わります(書き込むには --apply を付けてください)。");
    return;
  }

  assertTarget("import-kyokasho");
  const [actor] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.loginId, args.actorLoginId));
  if (!actor || actor.status !== "active") throw new Error("--actor のアカウントが見つからないか、無効です。");

  const [existing] = await db
    .select({ id: kyokashoBooks.id })
    .from(kyokashoBooks)
    .where(eq(kyokashoBooks.slug, args.slug));
  if (!existing && (!args.department || !args.title)) {
    throw new Error("新しい教科書には --department と --title が必要です。");
  }
  const bookId = existing?.id ?? randomUUID();
  const oldImages = existing
    ? await db.select({ storageKey: kyokashoImages.storageKey }).from(kyokashoImages).where(eq(kyokashoImages.bookId, bookId))
    : [];

  // 1. 画像を R2 に保存する(失敗したら、保存した分を消して止める)。
  const uploaded: { id: string; storageKey: string; contentType: string; size: number }[] = [];
  try {
    for (const [i, image] of images.entries()) {
      const storageKey = await putObject({
        appKey: manifest.appKey,
        ownerId: bookId,
        fileName: `image.${IMAGE_TYPES[image.contentType]}`,
        contentType: image.contentType,
        body: image.data,
      });
      uploaded.push({ id: image.id, storageKey, contentType: image.contentType, size: image.data.byteLength });
      if ((i + 1) % 20 === 0) console.log(`  画像を保存中… ${i + 1} / ${images.length}`);
    }

    // 2. 教科書と画像の記録を、1 つのトランザクションで入れ替える。
    await db.transaction(async (tx) => {
      const settings = {
        ...(args.department !== undefined ? { department: args.department } : {}),
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.sourceUrl !== undefined ? { sourceUrl: args.sourceUrl } : {}),
        ...(args.sortOrder !== undefined ? { sortOrder: args.sortOrder } : {}),
      };
      if (existing) {
        await tx
          .update(kyokashoBooks)
          .set({ ...settings, content, importedAt: new Date(), importedBy: actor.id })
          .where(eq(kyokashoBooks.id, bookId));
        await tx.delete(kyokashoImages).where(eq(kyokashoImages.bookId, bookId));
      } else {
        await tx.insert(kyokashoBooks).values({
          id: bookId,
          slug: args.slug,
          department: args.department!,
          title: args.title!,
          sourceUrl: args.sourceUrl ?? "",
          sortOrder: args.sortOrder ?? 0,
          content,
          importedBy: actor.id,
        });
      }
      for (let i = 0; i < uploaded.length; i += 200) {
        await tx.insert(kyokashoImages).values(uploaded.slice(i, i + 200).map((u) => ({ ...u, bookId })));
      }
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: existing ? "kyokasho.book.reimport" : "kyokasho.book.import",
        targetType: "kyokasho_book",
        targetId: bookId,
        after: {
          slug: args.slug,
          ...settings,
          file: args.file.split(/[\\/]/).pop(),
          chapters: content.chapters.length,
          images: uploaded.length,
        },
      });
    });
  } catch (err) {
    for (const u of uploaded) await deleteObject(u.storageKey).catch(() => undefined);
    throw err;
  }

  // 3. 入れ替える前の画像を R2 から消す(失敗しても、教科書の表示には影響しない)。
  let leftover = 0;
  for (const old of oldImages) {
    await deleteObject(old.storageKey).catch(() => {
      leftover++;
    });
  }
  console.log(
    `${existing ? "入れ替えました" : "新しく作りました(非公開。/apps/kyokasho/manage で公開してください)"}: ${args.slug}` +
      (leftover ? `(古い画像 ${leftover} 個を R2 から消せませんでした)` : ""),
  );
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
