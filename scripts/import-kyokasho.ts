// ロングの教科書の取り込み(docs/DESIGN.md 30 章)。
// Google ドキュメントを「ファイル → ダウンロード → Microsoft Word(.docx)」で保存したファイルを渡す。
// 図形描画で描いた図がある教科書は「ウェブページ(.html、zip 圧縮)」で保存した .zip を渡す(Word では図が空になる。写真は表示の大きさに縮まる)。
// 元の Google ドキュメントは読むだけで、変えない。教科書の中身はリポジトリに入れない(社内の情報のため)。
//
// 実行(既定は確認だけで、DB にも R2 にも書き込まない):
//   npm run db:import-kyokasho -- <ファイル.docx> --slug <URL の名前> --actor <ログインID> \
//     [--department <まとまり>] [--title <題名>] [--source-url <元のドキュメントの URL>] [--sort <並び順>] [--apply]
// 新しい教科書は --department と --title が必要で、非公開・見られる人「全員」で作る(公開は /apps/kyokasho/manage で)。
// 同じ --slug の教科書があれば、中身と画像だけを入れ替える(公開・見られる人などの設定は残す。指定した項目だけ変える)。
// 取り込んだあとは、--source-url(元の Google ドキュメント)があれば毎日自動で同期される(src/modules/apps/kyokasho/sync.ts)。
// --preview <ファイル.json> で、読み取った中身を JSON に書き出せる(確認用。リポジトリの外に置くこと)。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { collectImageIds, countQuizQuestions, type BookContent } from "../src/modules/apps/kyokasho/content";
import { importDocx, importGoogleZip, type ImportResult, type KnownImages } from "../src/modules/apps/kyokasho/import";
import { isValidSlug } from "../src/modules/apps/kyokasho/logic";
import { kyokashoBooks } from "../src/modules/apps/kyokasho/schema";
import { saveBookContent } from "../src/modules/apps/kyokasho/store";
import { users } from "../src/modules/core/auth/schema";
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

function read(file: Buffer, isZip: boolean, known?: KnownImages): Promise<ImportResult> {
  return isZip ? importGoogleZip(file, known) : importDocx(file, known);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // Word(.docx)か、Google ドキュメントの「ウェブページ」書き出し(.zip。図形描画の図も入る)。
  const file = readFileSync(args.file);
  const isZip = args.file.toLowerCase().endsWith(".zip");
  const result = await read(file, isZip);
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
  // 写真の置き場所(R2 のキーの頭)も、DB と同じ側にそろえる(本番の DB に dev/ の写真を載せない)。
  const expectedPrefix = process.env.DB_TARGET === "production" ? "prod/" : "dev/";
  if ((process.env.R2_KEY_PREFIX ?? "") !== expectedPrefix) {
    throw new Error(`DB_TARGET=${process.env.DB_TARGET} のときは R2_KEY_PREFIX=${expectedPrefix} にしてください。`);
  }
  const [actor] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.loginId, args.actorLoginId));
  if (!actor || actor.status !== "active") throw new Error("--actor のアカウントが見つからないか、無効です。");

  const [existing] = await db
    .select({ content: kyokashoBooks.content })
    .from(kyokashoBooks)
    .where(eq(kyokashoBooks.slug, args.slug));
  if (!existing && (!args.department || !args.title)) {
    throw new Error("新しい教科書には --department と --title が必要です。");
  }
  // 前回の取り込みと同じ画像は、縮め直さず・保存し直さずに使い回す。
  const known = existing?.content.source?.images;
  const final = known ? await read(file, isZip, known) : result;

  const settings = {
    ...(args.department !== undefined ? { department: args.department } : {}),
    ...(args.title !== undefined ? { title: args.title } : {}),
    ...(args.sourceUrl !== undefined ? { sourceUrl: args.sourceUrl } : {}),
    ...(args.sortOrder !== undefined ? { sortOrder: args.sortOrder } : {}),
  };
  const saved = await saveBookContent({
    slug: args.slug,
    result: final,
    source: { format: isZip ? "zip" : "docx", sha256: createHash("sha256").update(file).digest("hex") },
    actorUserId: actor.id,
    settings,
    origin: { file: args.file.split(/[\\/]/).pop() },
    onProgress: (done, total) => {
      if (done % 20 === 0) console.log(`  画像を保存中… ${done} / ${total}`);
    },
  });
  console.log(
    `${saved.created ? "新しく作りました(非公開。/apps/kyokasho/manage で公開してください)" : "入れ替えました"}: ${args.slug}` +
      `(新しい画像 ${saved.uploaded}・使い回し ${saved.reused}・消した画像 ${saved.removed}` +
      (saved.movedComments ? `・位置を付け直したツッコミ ${saved.movedComments}` : "") +
      ")" +
      (saved.leftover ? `(古い画像 ${saved.leftover} 個を R2 から消せませんでした)` : ""),
  );
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
