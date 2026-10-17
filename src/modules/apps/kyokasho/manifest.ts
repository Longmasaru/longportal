import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章・30 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 読むだけなら専用の権限は要らない(教科書ごとに、見られる人を決める)。教科書の設定を変えるには kyokasho.books.manage が要る。
export const MANAGE_PERMISSION = "kyokasho.books.manage";
// ツッコミ(読んだ人の疑問・提案)に返事をし、採用を決める(教科書チーム)。MANAGE_PERMISSION を持つ人もできる。docs/DESIGN.md 32 章。
export const COMMENTS_PERMISSION = "kyokasho.comments.manage";

export const manifest = {
  appKey: "kyokasho",
  route: "/apps/kyokasho",
  displayName: "ロングの教科書",
  description: "部署ごとの教科書です。仕事の進め方・安全・道具・機械の使い方を学び、章の終わりのテストで確かめます。",
  icon: "graduation",
  permissions: [
    { code: MANAGE_PERMISSION, description: "ロングの教科書: 教科書の公開・見られる人・表示名の変更" },
    { code: COMMENTS_PERMISSION, description: "ロングの教科書: ツッコミへの返事・採用の判断(教科書チーム)" },
  ],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
