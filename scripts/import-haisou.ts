// 配達ルートの元データ(Google スプレッドシート「取引先一覧表」)の取り込み(docs/DESIGN.md 29 章)。
// 各シートを CSV に書き出したものを、1 つのフォルダに次の名前で置いて渡す(ないファイルは飛ばす):
//   clients.csv(取引先一覧)/ drivers.csv(配達者リスト)/ history.csv(配達ルート履歴)/ saved-routes.csv(保存ルート)
// 元のスプレッドシートは読むだけで、変更しない。
//
// 実行(既定は確認だけで、DB に書き込まない):
//   npm run db:import-haisou -- <フォルダ> --actor <ログインID>
//   npm run db:import-haisou -- <フォルダ> --actor <ログインID> --apply
// 取り込み先(取引先・配達者・履歴・保存ルート)にすでにデータがあるときは止まる。
// 入れ直すときは --replace(その 4 つを空にしてから入れる。前回の入力内容と住所の座標の控えは残す)。
// CSV には取引先の情報が入るため、リポジトリの中に置かないこと。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { count, eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import {
  readClients,
  readDrivers,
  readHistory,
  readSavedRoutes,
  type ImportIssue,
} from "../src/modules/apps/haisou/import";
import {
  haisouClients,
  haisouDrivers,
  haisouHistory,
  haisouSavedRoutes,
} from "../src/modules/apps/haisou/schema";
import { writeAuditLog } from "../src/modules/core/audit";
import { users } from "../src/modules/core/auth/schema";
import { assertTarget } from "./guard";

type Args = { dir: string; actorLoginId: string; apply: boolean; replace: boolean };

function parseArgs(argv: string[]): Args {
  const rest: string[] = [];
  const args = { actorLoginId: "", apply: false, replace: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--replace") args.replace = true;
    else if (a === "--actor") args.actorLoginId = (argv[++i] ?? "").trim().toLowerCase();
    else rest.push(a);
  }
  if (rest.length !== 1 || !args.actorLoginId) {
    throw new Error("使い方: npm run db:import-haisou -- <フォルダ> --actor <ログインID> [--replace] [--apply]");
  }
  return { dir: rest[0], ...args };
}

function readIfExists<T>(dir: string, file: string, read: (text: string) => { records: T[]; issues: ImportIssue[] }) {
  const path = join(dir, file);
  if (!existsSync(path)) {
    console.log(`[import] ${file}: ファイルがないので飛ばします`);
    return null;
  }
  const r = read(readFileSync(path, "utf8"));
  console.log(`[import] ${file}: 取り込める行 ${r.records.length} 件 / 注意 ${r.issues.length} 件`);
  for (const issue of r.issues) console.log(`  - ${issue.sheet} ${issue.line} 行目: ${issue.message}`);
  return r.records;
}

const BATCH = 200;
async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) await insert(rows.slice(i, i + BATCH));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertTarget("import-haisou");

  const clients = readIfExists(args.dir, "clients.csv", readClients);
  const drivers = readIfExists(args.dir, "drivers.csv", readDrivers);
  const history = readIfExists(args.dir, "history.csv", readHistory);
  const saved = readIfExists(args.dir, "saved-routes.csv", readSavedRoutes);
  if (history) console.log(`[import] 履歴の便(保存 1 回分): ${new Set(history.map((h) => h.batch)).size} 件`);

  const [actor] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.loginId, args.actorLoginId));
  if (!actor || actor.status !== "active") throw new Error("--actor のアカウントが見つからないか、無効です。");

  const existing = {
    clients: (await db.select({ n: count() }).from(haisouClients))[0].n,
    drivers: (await db.select({ n: count() }).from(haisouDrivers))[0].n,
    history: (await db.select({ n: count() }).from(haisouHistory))[0].n,
    saved: (await db.select({ n: count() }).from(haisouSavedRoutes))[0].n,
  };
  console.log(
    `[import] 取り込み先の今の件数: 取引先 ${existing.clients} / 配達者 ${existing.drivers} / 履歴 ${existing.history} / 保存ルート ${existing.saved}`,
  );
  const hasData = Object.values(existing).some((n) => n > 0);
  if (hasData && !args.replace) {
    console.log("[import] 取り込み先にデータがあるため止めました(入れ直すときは --replace)。");
    return;
  }

  if (!args.apply) {
    console.log(`[import] 確認だけで終わりました(書き込むときは --apply${hasData ? " --replace" : ""})。`);
    return;
  }

  await db.transaction(async (tx) => {
    if (args.replace) {
      await tx.delete(haisouHistory);
      await tx.delete(haisouSavedRoutes);
      await tx.delete(haisouDrivers);
      await tx.delete(haisouClients);
    }
    if (clients?.length) {
      await insertChunks(clients, (chunk) =>
        tx.insert(haisouClients).values(chunk.map((c) => ({ ...c, updatedBy: actor.id }))),
      );
    }
    if (drivers?.length) await tx.insert(haisouDrivers).values(drivers);
    if (history?.length) {
      const batchIds = new Map<number, string>();
      const rows = history.map(({ batch, ...rest }) => {
        const { line, ...h } = rest;
        void line;
        if (!batchIds.has(batch)) batchIds.set(batch, crypto.randomUUID());
        return { ...h, batchId: batchIds.get(batch)!, createdBy: actor.id };
      });
      await insertChunks(rows, (chunk) => tx.insert(haisouHistory).values(chunk));
    }
    if (saved?.length) {
      await insertChunks(saved, (chunk) =>
        tx
          .insert(haisouSavedRoutes)
          .values(chunk.map((s) => ({ ...s, createdAt: s.savedAt, updatedBy: actor.id }))),
      );
    }
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "haisou.import",
      targetType: "haisou",
      after: {
        source: "google_sheet_csv",
        replaced: args.replace,
        clients: clients?.length ?? 0,
        drivers: drivers?.length ?? 0,
        history: history?.length ?? 0,
        savedRoutes: saved?.length ?? 0,
      },
    });
  });

  console.log(
    `[import] 書き込みました: 取引先 ${clients?.length ?? 0} 件、配達者 ${drivers?.length ?? 0} 件、履歴 ${history?.length ?? 0} 行、保存ルート ${saved?.length ?? 0} 件`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
