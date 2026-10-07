// 初期データの投入(冪等)。手順1では雇用区分のみ。
// 初期 system_admin は roles テーブルが入る手順4で追加する。
//
// 実行: npm run db:seed(.env.local の接続先に対して実行される)
// 本番への誤実行を防ぐため、DB_TARGET の明示を必須とし、production には CONFIRM_PRODUCTION=yes を要求する。
import { pool, db } from "../src/db/client";
import { employmentTypes } from "../src/modules/core/employment-types/schema";

const EMPLOYMENT_TYPES = [
  { code: "regular", name: "正社員", sortOrder: 10 },
  { code: "contract", name: "契約社員", sortOrder: 20 },
  { code: "part_time", name: "パート・アルバイト", sortOrder: 30 },
  { code: "dispatch", name: "派遣社員", sortOrder: 40 },
];

function assertTarget(): void {
  const target = process.env.DB_TARGET;
  if (target !== "development" && target !== "production") {
    throw new Error("DB_TARGET が未設定です。development か production を指定してください。");
  }
  if (target === "production" && process.env.CONFIRM_PRODUCTION !== "yes") {
    throw new Error("production への seed には CONFIRM_PRODUCTION=yes が必要です。");
  }
  const host = new URL(process.env.DATABASE_URL ?? "postgres://invalid").host;
  console.log(`[seed] DB_TARGET=${target} host=${host}`);
}

async function main(): Promise<void> {
  assertTarget();

  // 既存の code は変更しない(管理画面で名称・並び順を編集済みの可能性があるため)。
  const inserted = await db
    .insert(employmentTypes)
    .values(EMPLOYMENT_TYPES)
    .onConflictDoNothing({ target: employmentTypes.code })
    .returning({ code: employmentTypes.code });

  console.log(`[seed] employment_types: ${inserted.length} 件追加(既存は据え置き)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
