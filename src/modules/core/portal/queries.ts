// ポータル画面のデータ取得口。画面コンポーネントはここだけを呼ぶ。
// 現在はモックを返す。DB・認証・Audience 判定の実装後は、中身を差し替える
// (resolveActor → canAccessApp で絞り込んだアプリ、Audience・個人指定で絞り込んだお知らせ・リンク)。
import { connection } from "next/server";
import { todayJst } from "../shared/jst";
import { createMockNotices, mockApps, mockLinks, mockUser } from "./mock-data";
import { buildNavigation } from "./navigation";
import { comparePersonalNotices, isBannerActive, noticeChannel } from "./notices";
import type { NavLeaf, PortalContext, PortalHomeData } from "./types";

const HOME_PERSONAL_NOTICE_LIMIT = 5;
const HOME_BANNER_LIMIT = 2;

/** レイアウト(ヘッダー・サイドバー)用。 */
export async function getPortalContext(): Promise<PortalContext> {
  // 実装後はセッションに依存して毎回評価されるため、モックでも動的レンダリングにしておく。
  await connection();
  const notices = createMockNotices(todayJst());
  return {
    user: mockUser,
    navigation: buildNavigation({
      user: mockUser,
      apps: mockApps,
      notices,
      links: mockLinks,
    }),
  };
}

/**
 * ポータルホーム用。毎日開いて価値のある情報だけを返す:
 * 緊急の全社連絡(バナー)・本人宛のお知らせ・アプリ。通常の全社連絡は含めない。
 */
export async function getPortalHome(): Promise<PortalHomeData> {
  await connection();
  const today = todayJst();
  const notices = createMockNotices(today);

  const personal = notices.filter((n) => noticeChannel(n) === "personal");
  const personalSorted = [...personal].sort(comparePersonalNotices);
  // 既読で対応も不要なものは、ホームには出さない(一覧は個人のお知らせ画面で見る)。
  const personalForHome = personalSorted
    .filter((n) => n.requiresAction || !n.isRead)
    .slice(0, HOME_PERSONAL_NOTICE_LIMIT);

  return {
    urgentBanners: notices.filter((n) => isBannerActive(n, today)).slice(0, HOME_BANNER_LIMIT),
    personalNotices: personalForHome,
    actionRequiredCount: personal.filter((n) => n.requiresAction).length,
    // 実装後は各アプリの manifest が提供する「未対応件数」を集める。
    pendingItems: mockApps.flatMap((app) =>
      app.summary?.tone === "attention"
        ? [
            {
              appKey: app.appKey,
              appName: app.displayName,
              icon: app.icon,
              label: app.summary.label,
              href: app.href,
            },
          ]
        : [],
    ),
  };
}

/** メニュー項目(外部リンクを除く)を href から引く(準備中ページの見出し用)。 */
export async function findNavItem(href: string): Promise<NavLeaf | undefined> {
  const { navigation } = await getPortalContext();
  const leaves = [navigation.home, ...navigation.sections.flatMap((s) => s.items)];
  return leaves.find((item) => !item.external && item.href === href);
}
