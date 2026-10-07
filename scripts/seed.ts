// 初期データの投入(冪等)。雇用区分と、初期管理者アカウント(ユーザーが 1 人もいないときだけ)。
// 権限(permission)の同期と system_admin ロールの用意、初期管理者への system_admin の付与も行う。
//
// 実行: npm run db:seed(.env.local の接続先に対して実行される)
// 本番への誤実行を防ぐため、DB_TARGET の明示を必須とし、production には CONFIRM_PRODUCTION=yes を要求する。
import { count } from "drizzle-orm";
import { pool, db } from "../src/db/client";
import { assertTarget } from "./guard";
import { hashPassword } from "../src/modules/core/auth/password";
import { users } from "../src/modules/core/auth/schema";
import { ensureDefaultAudiences } from "../src/modules/core/audience/bootstrap";
import { employmentTypes } from "../src/modules/core/employment-types/schema";
import { allPermissionDefinitions } from "../src/modules/core/roles/catalog";
import { bootstrapSystemAdmin, syncPermissions } from "../src/modules/core/roles/sync";

const EMPLOYMENT_TYPES = [
  { code: "regular", name: "正社員", sortOrder: 10 },
  { code: "contract", name: "契約社員", sortOrder: 20 },
  { code: "part_time", name: "パート・アルバイト", sortOrder: 30 },
  { code: "dispatch", name: "派遣社員", sortOrder: 40 },
];

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
  assertTarget("seed");

  // 既存の code は変更しない(管理画面で名称・並び順を編集済みの可能性があるため)。
  const inserted = await db
    .insert(employmentTypes)
    .values(EMPLOYMENT_TYPES)
    .onConflictDoNothing({ target: employmentTypes.code })
    .returning({ code: employmentTypes.code });

  console.log(`[seed] employment_types: ${inserted.length} 件追加(既存は据え置き)`);

  await seedInitialAdmin();

  // 初期の Audience「全社員」(未設定は誰にも見せない方針のため、最初から用意する)。
  const audienceCreated = await db.transaction((tx) => ensureDefaultAudiences(tx));
  console.log(audienceCreated ? "[seed] audiences: 「全社員」を作成" : "[seed] audiences: 「全社員」は作成済み");

  // 権限(コード定義)の反映と、system_admin ロールの用意。
  const report = await db.transaction((tx) => syncPermissions(tx, allPermissionDefinitions()));
  console.log(`[seed] permissions: 追加 ${report.added.length}件 / system_admin に付与 ${report.grantedToSystemAdmin}件`);

  // system_admin を持つユーザーが 1 人もいなければ、最も古い「社員に紐づかないアカウント」に付与する。
  const granted = await db.transaction((tx) => bootstrapSystemAdmin(tx));
  console.log(granted ? `[seed] system_admin を ${granted} に付与` : "[seed] system_admin: 付与済み(または対象アカウントなし)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
