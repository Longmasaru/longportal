import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章・34 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 送る・読むは、表示する相手に当てはまる社員なら誰でもできる。集計と削除だけ、専用の権限にする。
export const manifest = {
  appKey: "arigato",
  route: "/apps/arigato",
  displayName: "ありがとうカード",
  description: "「教えてくれた」「助けてくれた」を、一言のカードで送り合います。",
  icon: "heart",
  permissions: [
    { code: "arigato.stats.view", description: "ありがとうカードの集計(月・どんなこと・部署・受け取った人)の閲覧" },
    { code: "arigato.cards.manage", description: "ありがとうカードの削除(不適切な内容への対応)" },
  ],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
