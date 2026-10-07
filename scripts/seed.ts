// 初期データの投入(冪等)。雇用区分と、初期管理者アカウント(ユーザーが 1 人もいないときだけ)。
// 初期管理者への system_admin ロールの付与は、roles テーブルが入る手順4で追加する。
//
// 実行: npm run db:seed(.env.local の接続先に対して実行される)
// 本番への誤実行を防ぐため、DB_TARGET の明示を必須とし、production には CONFIRM_PRODUCTION=yes を要求する。
import { count } from "drizzle-orm";
import { pool, db } from "../src/db/client";
import { hashPassword } from "../src/modules/core/auth/password";
import { users } from "../src/modules/core/auth/schema";
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

/** 初期管理者(社員以外のアカウント)。ユーザーが 1 人でもいれば何もしない。初回ログインでパスワード変更が必須。 */
async function seedInitialAdmin(): Promise<void> {
  const loginId = process.env.SEED_ADMIN_LOGIN_ID?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!loginId || !password) {
    console.log("[seed] users: SEED_ADMIN_LOGIN_ID / SEED_ADMIN_PASSWORD が未設定のためスキップ");
    return;
  }
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n > 0) {
    console.log("[seed] users: 既にユーザーがいるためスキップ");
    return;
  }
  await db.insert(users).values({
    loginId,
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
  });
  console.log(`[seed] users: 初期管理者(${loginId})を作成(初回ログインでパスワード変更が必須)`);
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

  await seedInitialAdmin();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
