import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 組織図は表示する相手に当てはまる人なら誰でも見てよく、編集は既存の管理画面(社員・所属・マスタ)で行うので、専用の権限は持たない。
export const manifest = {
  appKey: "soshikizu",
  route: "/apps/soshikizu",
  displayName: "組織図",
  description: "部署ごとに、だれがいるかを役職の順に見られます。",
  icon: "users",
  permissions: [],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
