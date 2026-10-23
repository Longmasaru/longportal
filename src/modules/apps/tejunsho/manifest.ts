import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章・43 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 閲覧だけのアプリなので、専用の権限は持たない(表示する相手に当てはまる社員なら見られる)。
export const manifest = {
  appKey: "tejunsho",
  route: "/apps/tejunsho",
  displayName: "手順書",
  description: "社内で使うシステムや作業の手順を、画面の表記どおりにまとめています。",
  icon: "file-text",
  permissions: [],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
