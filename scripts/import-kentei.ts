// 技能検定の練習の試験の取り込み(docs/DESIGN.md 43 章)。
// フォルダに exam.json(問題・用語・実技。形は src/modules/apps/kentei/content.ts)と、そこに書いた画像のファイルを置いて渡す。
// 過去問は「禁転載複製」の資料なので、フォルダはリポジトリの外に置く(中身は DB、画像は R2 に入る)。
//
// 実行(既定は確認だけで、DB にも R2 にも書き込まない):
//   npm run db:import-kentei -- <フォルダ> --slug <URL の名前> --actor <ログインID> \
//     [--title <職種・作業>] [--grade <級>] [--title-vi <ベトナム語の名前>] [--sort <並び順>] [--translate] [--publish] [--apply]
// 新しい試験は --title と --grade が必要で、非公開で作る(--publish を付けたときだけ公開)。
// 同じ --slug の試験があれば、中身と画像を入れ替える(公開の設定は残す)。練習の記録は問題の id でつながるので残る。
// --translate: ベトナム語が空の文を Claude で訳して埋め、exam.json の横に exam.translated.json として書き出す(確認用)。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { examContentSchema, imageRefs, pastSets } from "../src/modules/apps/kentei/content";
import { kenteiExams } from "../src/modules/apps/kentei/schema";
import { IMAGE_TYPES, saveExam, type ExamImage } from "../src/modules/apps/kentei/store";
import { fillVietnamese, missingVietnamese } from "../src/modules/apps/kentei/translate";
import { users } from "../src/modules/core/auth/schema";
import { assertTarget } from "./guard";

type Args = {
  dir: string;
  slug: string;
  actorLoginId: string;
  title?: string;
  grade?: string;
  titleVi?: string;
  sortOrder?: number;
  translate: boolean;
  publish: boolean;
  apply: boolean;
};

const USAGE =
  "使い方: npm run db:import-kentei -- <フォルダ> --slug <URL の名前> --actor <ログインID> " +
  "[--title <職種・作業>] [--grade <級>] [--title-vi <名前>] [--sort <並び順>] [--translate] [--publish] [--apply]";

/** URL に使う名前(images は画像の入口と重なるので使えない)。 */
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(slug) && slug !== "images";
}

function parseArgs(argv: string[]): Args {
  const rest: string[] = [];
  const args: Omit<Args, "dir"> = { slug: "", actorLoginId: "", translate: false, publish: false, apply: false };
  const value = (i: number) => {
    const v = argv[i];
    if (v === undefined || v.startsWith("--")) throw new Error(USAGE);
    return v.trim();
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--publish") args.publish = true;
    else if (a === "--translate") args.translate = true;
    else if (a === "--slug") args.slug = value(++i);
    else if (a === "--actor") args.actorLoginId = value(++i).toLowerCase();
    else if (a === "--title") args.title = value(++i);
    else if (a === "--grade") args.grade = value(++i);
    else if (a === "--title-vi") args.titleVi = value(++i);
    else if (a === "--sort") {
      const n = Number(value(++i));
      if (!Number.isInteger(n) || n < 0 || n > 9999) throw new Error("--sort は 0〜9999 の整数にしてください。");
      args.sortOrder = n;
    } else rest.push(a);
  }
  if (rest.length !== 1 || !args.slug || !args.actorLoginId) throw new Error(USAGE);
  if (!isValidSlug(args.slug)) throw new Error("--slug は半角の小文字・数字・-(例: kouban-kikai-kiso)にしてください。");
  if (args.title !== undefined && (!args.title || args.title.length > 80))
    throw new Error("--title は 1〜80 文字にしてください。");
  if (args.grade !== undefined && (!args.grade || args.grade.length > 20))
    throw new Error("--grade は 1〜20 文字にしてください。");
  if (args.titleVi !== undefined && args.titleVi.length > 160)
    throw new Error("--title-vi は 160 文字以内にしてください。");
  return { dir: rest[0], ...args };
}

const TYPE_OF: Record<string, string> = Object.fromEntries(
  Object.entries(IMAGE_TYPES).map(([t, ext]) => [`.${ext}`, t]),
);
TYPE_OF[".jpeg"] = "image/jpeg";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = join(args.dir, "exam.json");
  const parsed = examContentSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    throw new Error(
      `exam.json の形が正しくありません:\n${parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    );
  }
  const content = parsed.data;

  const images: ExamImage[] = [];
  for (const name of imageRefs(content)) {
    const path = join(args.dir, name);
    const contentType = TYPE_OF[extname(name).toLowerCase()];
    if (!existsSync(path)) throw new Error(`画像のファイルがありません: ${name}`);
    if (!contentType) throw new Error(`画像は png・jpg・webp にしてください: ${name}`);
    images.push({ name, contentType, data: readFileSync(path) });
  }
  const bytes = images.reduce((n, i) => n + i.data.byteLength, 0);
  const sets = pastSets(content.questions);
  console.log(`[import-kentei] ${file}`);
  console.log(
    `  学科 ${content.questions.length} 問(過去問 ${sets.size} 回分: ${[...sets].map(([r, ids]) => `第${r}回 ${ids.length}問`).join("・")})`,
  );
  console.log(
    `  本番の形 ${content.written.count} 問・${content.written.minutes} 分・合格 ${Math.round(content.written.passRatio * 100)}%`,
  );
  console.log(
    `  用語 ${content.glossary.length}・実技 ${content.practical ? "あり" : "なし"}・画像 ${images.length} 個(${(bytes / 1024 / 1024).toFixed(1)} MB)`,
  );
  for (const [r, ids] of sets) {
    if (ids.length !== content.written.count)
      console.log(`  - 注意: 第${r}回は ${ids.length} 問です(本番は ${content.written.count} 問)。`);
  }

  const missing = missingVietnamese(content).length;
  if (args.translate && missing) {
    console.log(`  ベトナム語が空の文 ${missing} 件を訳します…`);
    await fillVietnamese(content, (done, total) => console.log(`    ${done} / ${total}`));
    const out = join(args.dir, "exam.translated.json");
    writeFileSync(out, JSON.stringify(content, null, 2));
    console.log(`  訳を入れた中身を ${out} に書き出しました(確かめてから exam.json にしてもよい)。`);
  } else if (missing) {
    console.log(`  - 注意: ベトナム語が空の文が ${missing} 件あります(--translate で訳せます)。`);
  }

  if (!args.apply) {
    console.log("確認だけで終わります(書き込むには --apply を付けてください)。");
    return;
  }

  assertTarget("import-kentei");
  // 画像の置き場所(R2 のキーの頭)も、DB と同じ側にそろえる(本番の DB に dev/ の画像を載せない)。
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
    .select({
      title: kenteiExams.title,
      grade: kenteiExams.grade,
      titleVi: kenteiExams.titleVi,
      sortOrder: kenteiExams.sortOrder,
    })
    .from(kenteiExams)
    .where(eq(kenteiExams.slug, args.slug));
  const title = args.title ?? existing?.title;
  const grade = args.grade ?? existing?.grade;
  if (!title || !grade) throw new Error("新しい試験には --title と --grade が必要です。");

  const saved = await saveExam({
    slug: args.slug,
    settings: {
      title,
      grade,
      titleVi: args.titleVi ?? existing?.titleVi ?? "",
      sortOrder: args.sortOrder ?? existing?.sortOrder ?? 0,
    },
    content,
    images,
    actorUserId: actor.id,
    publish: args.publish,
    origin: { folder: args.dir.split(/[\\/]/).filter(Boolean).pop(), translated: args.translate },
  });
  console.log(
    `${saved.created ? `新しく作りました(${args.publish ? "公開" : "非公開。/apps/kentei で公開できます"})` : "入れ替えました"}: ${args.slug}` +
      `(新しい画像 ${saved.uploaded}・使い回し ${saved.reused}・消した画像 ${saved.removed})` +
      (saved.leftover ? `(古い画像 ${saved.leftover} 個を R2 から消せませんでした)` : ""),
  );
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
