import { getPortalHome } from "../queries";
import type { HomeWeek, PendingItem } from "../types";
import { PendingItems } from "./home/pending-items";
import { PersonalNotices } from "./home/personal-notices";
import { UrgentBanner } from "./home/urgent-banner";
import { WeekCalendar } from "./home/week-calendar";

// ホーム中央 = 「今、自分が確認すべき情報」だけ。
// 自分が誰か(右上のユーザー領域)・どこへ移動するか(サイドバー: お知らせ・アプリ・社内リンク)は
// ここに重複して置かない。通常の全社連絡もサイドバーの「重要・全社」で確認する。
// 業務アプリが出す「要対応」と「今週の予定」(会社カレンダー)は、core がアプリを参照しないよう、
// src/app のホームのページが集めて渡す。
export async function PortalHome({
  appPendingItems = [],
  week = null,
}: {
  appPendingItems?: PendingItem[];
  week?: HomeWeek | null;
}) {
  const data = await getPortalHome();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 md:px-8 md:py-10">
      <h1 className="sr-only">ホーム</h1>
      <UrgentBanner notices={data.urgentBanners} />
      <PersonalNotices
        notices={data.personalNotices}
        hiddenCount={data.hiddenNoticeCount}
        actionRequiredCount={data.actionRequiredCount}
      />
      <PendingItems items={[...data.pendingItems, ...appPendingItems]} />
      {week ? <WeekCalendar week={week} /> : null}
      <p className="border-brand01/15 text-brand04 border-t pt-4 text-xs">© LONG Co., Ltd.</p>
    </div>
  );
}
