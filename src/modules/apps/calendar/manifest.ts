import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 会社の休日は全社員が見てよく、メモ・予定・自分の誕生日は本人だけのデータ。
// 全社員の誕生日を見るには calendar.birthdays.view が要る(全社のスコープで判定。docs/DESIGN.md 37 章)。
export const CALENDAR_BIRTHDAYS_VIEW = "calendar.birthdays.view";

export const manifest = {
  appKey: "calendar",
  route: "/apps/calendar",
  displayName: "会社カレンダー",
  description: "会社の休日と出勤日を確認し、自分のメモや予定を書き込めます。",
  icon: "calendar",
  permissions: [
    {
      code: CALENDAR_BIRTHDAYS_VIEW,
      description: "会社カレンダー: 全社員の誕生日(名前と月日。年齢は出さない)を月の表とホームで見る(全社のスコープで付ける)",
    },
  ],
  scopedEntities: [],
  version: 1,
} as const satisfies AppManifest;
