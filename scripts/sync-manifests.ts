// コード側の定義(権限など)を DB に反映する。migration のあとに明示的に実行する(起動時の自動実行はしない)。
// いまは core の権限のみ。手順 6 で、各アプリの manifest(権限・app_registry)も対象にする。
//
// 実行: npm run sync:manifests [-- --prune]
//   --prune: コードに定義のない権限を DB から削除する(既定は残して警告する)
import { db, pool } from "../src/db/client";
import { allPermissionDefinitions } from "../src/modules/core/roles/catalog";
import { syncPermissions } from "../src/modules/core/roles/sync";
import { assertTarget } from "./guard";

async function main(): Promise<void> {
  assertTarget("sync");
  const prune = process.argv.includes("--prune");
  const report = await db.transaction((tx) => syncPermissions(tx, allPermissionDefinitions(), { prune }));

  console.log(`[sync] 追加: ${report.added.length}件${report.added.length ? ` (${report.added.join(", ")})` : ""}`);
  console.log(`[sync] 更新: ${report.updated.length}件`);
  console.log(`[sync] system_admin に新たに付与: ${report.grantedToSystemAdmin}件`);
  if (report.stale.length > 0) {
    console.warn(
      `[sync] コードに定義のない権限が DB に残っています: ${report.stale.join(", ")}` +
        (report.pruned ? "(削除しました)" : "(--prune で削除できます)"),
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
