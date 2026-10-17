import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章・31 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 社員本人は自分のページだけを見られる(権限は不要)。他の社員のページと記録の読み書きには hr.records.manage が要る。
export const HR_RECORDS_MANAGE = "hr.records.manage";

export const manifest = {
  appKey: "hr",
  route: "/apps/hr",
  displayName: "人事管理",
  description: "面談で話したこと・注意・ほめを、社員ごとに記録します。社員は自分のページを見られます。",
  icon: "users",
  permissions: [
    {
      code: HR_RECORDS_MANAGE,
      description: "人事管理: 社員のページの閲覧と、面談・注意・ほめの記録の追加・編集・削除(スコープは対象の社員の今日の所属で判定)",
    },
  ],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
