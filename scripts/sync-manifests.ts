// コード側の定義(権限・アプリの登録簿)を DB に反映する。migration のあとに明示的に実行する(起動時の自動実行はしない)。
// - 権限: core の権限 + 各アプリの manifest の権限 + SSO でつなぐ別プロジェクトのアプリの権限(docs/DESIGN.md 6 章・28 章)
// - アプリの登録簿: 各アプリの manifest → core.app_registry(docs/DESIGN.md 8 章・24 章)
//
// 実行: npm run sync:manifests [-- --prune]
//   --prune: コードに定義のない権限を DB から削除する(既定は残して警告する)
import { db, pool } from "../src/db/client";
import { EXTERNAL_APP_CONTRACTS } from "../src/modules/apps/external-apps";
import { APP_MANIFESTS } from "../src/modules/apps/manifests";
import { syncAppRegistry } from "../src/modules/core/apps/sync";
import { allPermissionDefinitions, type PermissionDefinition } from "../src/modules/core/roles/catalog";
import { syncPermissions } from "../src/modules/core/roles/sync";
import { assertTarget } from "./guard";

async function main(): Promise<void> {
  assertTarget("sync");
  const prune = process.argv.includes("--prune");
  const appPermissions: PermissionDefinition[] = [...APP_MANIFESTS, ...EXTERNAL_APP_CONTRACTS].flatMap((m) =>
    m.permissions.map((p) => ({ code: p.code, description: p.description, appKey: m.appKey })),
  );

  const { report, apps } = await db.transaction(async (tx) => ({
    report: await syncPermissions(tx, [...allPermissionDefinitions(), ...appPermissions], { prune }),
    apps: await syncAppRegistry(tx, APP_MANIFESTS),
  }));

  console.log(`[sync] 権限の追加: ${report.added.length}件${report.added.length ? ` (${report.added.join(", ")})` : ""}`);
  console.log(`[sync] 権限の更新: ${report.updated.length}件`);
  console.log(`[sync] system_admin に新たに付与: ${report.grantedToSystemAdmin}件`);
  if (report.stale.length > 0) {
    console.warn(
      `[sync] コードに定義のない権限が DB に残っています: ${report.stale.join(", ")}` +
        (report.pruned ? "(削除しました)" : "(--prune で削除できます)"),
    );
  }
  console.log(
    `[sync] アプリの登録: 追加 ${apps.added.length}件${apps.added.length ? ` (${apps.added.join(", ")}。無効の状態で登録。/admin/apps で有効にする)` : ""} / 更新 ${apps.updated.length}件`,
  );
  if (apps.missing.length > 0) {
    console.warn(`[sync] コードから消えたアプリを無効にしました: ${apps.missing.join(", ")}`);
  }
  if (apps.conflicts.length > 0) {
    console.warn(`[sync] 別プロジェクトのアプリと app_key が重なっています(登録しませんでした): ${apps.conflicts.join(", ")}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
