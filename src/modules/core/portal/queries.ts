// ポータル画面のデータ取得口。画面コンポーネントはここだけを呼ぶ。
// 利用者(ユーザー・所属・役職)は実データ。お知らせ・アプリ・社内リンクはまだモックで、
// DB・Audience 判定の実装後に中身を差し替える(canAccessApp で絞り込んだアプリ、
// Audience・個人指定で絞り込んだお知らせ・リンク)。
import { redirect } from "next/navigation";
import { canGlobally, requireActor, type Actor } from "../access";
import { todayJst } from "../shared/jst";
import { createMockNotices, mockApps, mockLinks } from "./mock-data";
import { ADMIN_NAV, buildNavigation } from "./navigation";
import { comparePersonalNotices, isBannerActive, noticeChannel } from "./notices";
import type { NavLeaf, PortalContext, PortalHomeData, PortalUser } from "./types";

const HOME_PERSONAL_NOTICE_LIMIT = 5;
const HOME_BANNER_LIMIT = 2;


/** 利用者が見られる管理メニュー(必要な権限を全社で持つ項目だけ)。 */
function visibleAdminItems(actor: Actor) {
  return ADMIN_NAV.filter((item) => canGlobally(actor, item.permission)).map(
    (item): NavLeaf => ({ key: item.key, label: item.label, href: item.href, icon: item.icon }),
  );
}

function toPortalUser(actor: Actor, isAdmin: boolean): PortalUser {
  const primary = actor.assignments[0];
  const subtitle = actor.employee
    ? [
        primary ? `${primary.locationName} / ${primary.departmentName}` : "所属未設定",
        actor.employee.positionName,
      ]
        .filter(Boolean)
        .join(" ・ ")
    : `ログインID: ${actor.loginId}`;

  return {
    id: actor.userId,
    displayName: actor.employee?.name ?? actor.loginId,
    subtitle,
    employeeNumber: actor.employee?.employeeNumber ?? null,
    roleNames: [...new Set(actor.roles.map((r) => r.name))],
    isAdmin,
  };
}

/**
 * ポータル画面の入口の判定。ログイン済みかつアクセス許可済みの利用者を返す。
 * 初回ログイン(パスワード変更が必要)の場合は、変更画面へ送る。
 */
async function requirePortalActor(): Promise<Actor> {
  const actor = await requireActor();
  if (actor.mustChangePassword) redirect("/password");
  return actor;
}

/** レイアウト(ヘッダー・サイドバー)用。 */
export async function getPortalContext(): Promise<PortalContext> {
  const actor = await requirePortalActor();
  const adminItems = visibleAdminItems(actor);
  const user = toPortalUser(actor, adminItems.length > 0);
  const notices = createMockNotices(todayJst());
  return {
    user,
    navigation: buildNavigation({ adminItems, apps: mockApps, notices, links: mockLinks }),
  };
}

/**
 * ポータルホーム用。毎日開いて価値のある情報だけを返す:
 * 緊急の全社連絡(バナー)・本人宛のお知らせ・要対応。通常の全社連絡は含めない。
 */
export async function getPortalHome(): Promise<PortalHomeData> {
  await requirePortalActor();
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
