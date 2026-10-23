import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章・43 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 名簿は表示する相手に当てはまる人なら誰でも見てよい(2026-10-23 のユーザーの判断)。載せる人の登録・編集だけ、専用の権限にする。
export const manifest = {
  appKey: "nakama",
  route: "/apps/nakama",
  displayName: "ベトナムの仲間",
  description: "ベトナムから来た仲間の顔と名前を、大きな写真で見られます。A4 1 枚に印刷もできます。",
  icon: "users",
  permissions: [
    { code: "nakama.members.manage", description: "ベトナムの仲間の名簿に載せる人の登録・編集・外す(全社で割り当てる)" },
  ],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
