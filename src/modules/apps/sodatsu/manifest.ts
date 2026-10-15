import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 閲覧だけのアプリなので、専用の権限は持たない(表示する相手に当てはまる社員なら見られる)。
export const manifest = {
  appKey: "sodatsu",
  route: "/apps/sodatsu",
  displayName: "育てて、育つ。",
  description: "ロングの人事ポリシー「育てて、育つ。」の考え方と、今日からできることをまとめています。",
  icon: "sprout",
  permissions: [],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
