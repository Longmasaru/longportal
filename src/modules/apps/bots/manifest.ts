import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章・38 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// Bot を作る・変える・消すのは、bots.manage(全社)を持つ人だけ(全権管理者と Bot 管理者)。
export const MANAGE_PERMISSION = "bots.manage";

export const manifest = {
  appKey: "bots",
  route: "/apps/bots",
  displayName: "LINE WORKS の Bot",
  description: "雨予報や定時のお知らせを、LINE WORKS のトークルームに自動で送る Bot を作ります。",
  icon: "megaphone",
  permissions: [{ code: MANAGE_PERMISSION, description: "LINE WORKS の Bot: Bot の作成・変更・削除・試しの送信" }],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
