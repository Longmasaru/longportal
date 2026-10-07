// 管理者の復旧用: 指定した login_id に、全社の system_admin を付与する(冪等)。
// 管理画面にアクセスできるシステム管理者がいなくなったときに使う。
//
// 実行: npm run db:grant-admin -- <login_id>
import { db, pool } from "../src/db/client";
import { grantSystemAdmin } from "../src/modules/core/roles/sync";
import { assertTarget } from "./guard";

async function main(): Promise<void> {
  assertTarget("grant-admin");
  const loginId = process.argv[2];
  if (!loginId) throw new Error("使い方: npm run db:grant-admin -- <login_id>");
  const ok = await db.transaction((tx) => grantSystemAdmin(tx, loginId));
  console.log(ok ? `[grant-admin] ${loginId} に system_admin(全社)を付与しました。` : `[grant-admin] ユーザー ${loginId} が見つかりません。`);
  if (!ok) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
