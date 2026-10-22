// ポータル画面のデータ取得口。画面コンポーネントはここだけを呼ぶ。
// 利用者・お知らせ・社内リンクは実データ(宛先・Audience の判定は core/notices・core/links が行う)。
// アプリはアプリの登録簿(core/apps)で判定する。見本の架空データは出さない。
import { redirect } from "next/navigation";
import { canGlobally, requireActor, type Actor } from "../access";
import { getEmailStatus } from "../auth/recovery";
import { listAppsForActor } from "../apps";
import { listLinksForActor } from "../links";
import { listNoticesForActor } from "../notices";
import { todayJst } from "../shared/jst";
import { ADMIN_NAV, buildNavigation } from "./navigation";
import { comparePersonalNotices, isBannerActive } from "./notices";
import type {
  NavLeaf,
  Notice,
  PortalApp,
  PortalContext,
  PortalHomeData,
  PortalLink,
  PortalUser,
} from "./types";

const HOME_NOTICE_LIMIT = 8;
const HOME_BANNER_LIMIT = 2;

// ---- 利用者に見せる情報 ----

/** 利用者が使えるアプリ(アプリの登録簿で有効で、表示する相手に当てはまるもの)。 */
async function listVisibleApps(actor: Actor): Promise<PortalApp[]> {
  const apps = await listAppsForActor(actor);
  return apps.map((a) => ({
    appKey: a.appKey,
    displayName: a.displayName,
    description: a.description,
    icon: a.icon,
    // 別プロジェクトのアプリも、ポータルの中のページ(/apps/<app_key>)から開く(同じタブ。docs/DESIGN.md 28 章)
    href: a.kind === "external" ? `/apps/${a.appKey}` : a.route!,
  }));
}

/** 利用者に届いている、掲載中のお知らせ(画面用の形)。要対応 = 確認が必要で、まだ確認していないもの。 */
async function listVisibleNotices(actor: Actor): Promise<Notice[]> {
  const list = await listNoticesForActor(actor);
  return list.map((n) => ({
    id: n.id,
    title: n.title,
    summary: n.summary,
    body: n.body,
    kind: n.kind,
    priority: n.priority,
    target: n.target,
    publishedOn: n.publishedOn,
    isRead: n.isRead,
    requiresAction: n.requiresAction && !n.isAcknowledged,
    bannerUntil: n.isBanner && n.bannerUntil ? n.bannerUntil : undefined,
    href: `/notices/${n.id}`,
  }));
}

/** 利用者に見える社内リンク(有効で、宛先に当てはまるもの)。 */
async function listVisibleLinks(actor: Actor): Promise<PortalLink[]> {
  const links = await listLinksForActor(actor);
  return links.map((l) => ({ id: l.id, title: l.title, description: l.description, url: l.url }));
}


/** 利用者が見られる管理メニュー(必要な権限を全社で持つ項目だけ)。 */
function visibleAdminItems(actor: Actor) {
  return ADMIN_NAV.filter((item) => canGlobally(actor, item.permission)).map(
    (item): NavLeaf => ({ key: item.key, label: item.label, href: item.href, icon: item.icon }),
  );
}

function toPortalUser(actor: Actor, isAdmin: boolean, emailStatus: PortalUser["emailStatus"]): PortalUser {
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
    emailStatus,
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
export async function getPortalContext(appBadges?: Record<string, number>): Promise<PortalContext> {
  const actor = await requirePortalActor();
  const adminItems = visibleAdminItems(actor);
  const [apps, notices, links, email] = await Promise.all([
    listVisibleApps(actor),
    listVisibleNotices(actor),
    listVisibleLinks(actor),
    getEmailStatus(actor.userId),
  ]);
  const user = toPortalUser(
    actor,
    adminItems.length > 0,
    !email.email ? "none" : email.verified ? "verified" : "unverified",
  );
  return {
    user,
    navigation: buildNavigation({ adminItems, apps, notices, links, appBadges }),
  };
}

/**
 * ポータルホーム用。毎日開いて価値のある情報だけを返す:
 * 緊急の全社連絡(バナー)・あなたへのお知らせ(個人宛・全社宛の、未読と要対応)・アプリの要対応。
 */
export async function getPortalHome(): Promise<PortalHomeData> {
  const actor = await requirePortalActor();
  const today = todayJst();
  const [notices, apps] = await Promise.all([listVisibleNotices(actor), listVisibleApps(actor)]);

  // ホームはお知らせの入口。個人宛・全社宛を問わず、未読のものと要対応(確認がまだ)のものを出す。
  // 既読で対応も済んだものは出さない(一覧はサイドバーの「個人」「重要・全社」で見る)。
  const forHome = notices.filter((n) => n.requiresAction || !n.isRead).sort(comparePersonalNotices);

  return {
    urgentBanners: notices.filter((n) => isBannerActive(n, today)).slice(0, HOME_BANNER_LIMIT),
    personalNotices: forHome.slice(0, HOME_NOTICE_LIMIT),
    hiddenNoticeCount: Math.max(0, forHome.length - HOME_NOTICE_LIMIT),
    actionRequiredCount: forHome.filter((n) => n.requiresAction).length,
    // 実装後は各アプリの manifest が提供する「未対応件数」を集める。
    pendingItems: apps.flatMap((app) =>
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
