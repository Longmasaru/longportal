import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章・25 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// TODO は本人だけのデータなので、専用の権限は持たない(表示する相手に当てはまる社員なら使える)。
export const manifest = {
  appKey: "todo",
  route: "/apps/todo",
  displayName: "TODO",
  description: "自分のタスクを整理し、期限と優先度を管理します。追加したタスクは自動でカテゴリに分けられます。",
  icon: "check-square",
  permissions: [],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
