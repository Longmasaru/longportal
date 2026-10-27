import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章・44 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 練習するだけなら専用の権限は要らない(表示する相手に当てはまる社員なら使える。自分の成績だけが見える)。
/** 実習生などの成績(正答率・模擬テストの結果)を見る(指導する人)。 */
export const RESULTS_PERMISSION = "kentei.results.view";
/** 非公開の試験(取り込んだばかりのもの)も確かめる。 */
export const MANAGE_PERMISSION = "kentei.exams.manage";

export const manifest = {
  appKey: "kentei",
  route: "/apps/kentei",
  displayName: "技能検定の練習",
  description: "技能検定の学科の過去問・用語・模擬テストと、実技の流れを、日本語とベトナム語で練習できます。",
  icon: "clipboard",
  permissions: [
    {
      code: RESULTS_PERMISSION,
      description: "技能検定の練習: 練習している人の正答率・模擬テストの結果を見る(指導する人)",
    },
    {
      code: MANAGE_PERMISSION,
      description: "技能検定の練習: 非公開の試験(取り込んだばかりのもの)を確かめる",
    },
  ],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
