import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 会社の休日は全社員が見てよく、メモ・予定は本人だけのデータなので、専用の権限は持たない。
export const manifest = {
  appKey: "calendar",
  route: "/apps/calendar",
  displayName: "会社カレンダー",
  description: "会社の休日と出勤日を確認し、自分のメモや予定を書き込めます。",
  icon: "calendar",
  permissions: [],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
