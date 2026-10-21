import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章・38 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 日報を書くのは、アプリを使える社員なら誰でもできる(権限は不要)。他の人の日報を読んでコメントするには nippo.reports.review が要る。
export const NIPPO_REPORTS_REVIEW = "nippo.reports.review";

export const manifest = {
  appKey: "nippo",
  route: "/apps/nippo",
  displayName: "日報",
  description: "新人が毎日の日報を書いて提出し、指導者がコメントを返します。",
  icon: "file-text",
  permissions: [
    {
      code: NIPPO_REPORTS_REVIEW,
      description: "日報: 提出された日報の閲覧と、指導者としてのコメント(スコープは書いた社員の今日の所属で判定)",
    },
  ],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
