import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章・28 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 資料を見るだけなら権限は不要。回と資料の登録・変更・削除には aikyoshitsu.materials.manage が要る。
export const MANAGE_PERMISSION = "aikyoshitsu.materials.manage";

export const manifest = {
  appKey: "aikyoshitsu",
  route: "/apps/aikyoshitsu",
  displayName: "AI教室",
  description: "社内AI講習会の資料を、回ごとに開いて全画面で映せます。",
  icon: "graduation",
  permissions: [{ code: MANAGE_PERMISSION, description: "AI教室の回と資料(PDF)の登録・変更・削除" }],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
