import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章・29 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 元の Google スプレッドシートと同じく、使える人は全員がルート作成・取引先の管理をできるので、専用の権限は持たない
// (使う人はアプリ管理の「表示する相手」で決める)。
export const manifest = {
  appKey: "haisou",
  route: "/apps/haisou",
  displayName: "配達ルート",
  description: "配達先を選んで、最適なルート・タイムスケジュール・Google マップのリンクを作ります。取引先の管理もここで行います。",
  icon: "target",
  permissions: [],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
