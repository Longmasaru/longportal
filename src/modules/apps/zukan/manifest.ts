import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章・44 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 登録・閲覧・反応は、表示する相手に当てはまる社員なら誰でもできる。点数の確定(鑑定)と削除だけ、専用の権限にする。
export const manifest = {
  appKey: "zukan",
  route: "/apps/zukan",
  displayName: "カイゼン図鑑",
  description: "ちょっとした改善を、ビフォーとアフターの写真で図鑑に登録。みんなの工夫がどんどん増えていきます。",
  icon: "book",
  permissions: [
    { code: "zukan.entries.appraise", description: "カイゼン図鑑の点数の確定(鑑定)と、AI の下見の閲覧(全社で割り当てる)" },
    { code: "zukan.entries.manage", description: "カイゼン図鑑の不適切なページの削除(全社で割り当てる)" },
  ],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
