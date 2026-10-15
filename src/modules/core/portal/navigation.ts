import { noticeChannel } from "./notices";
import type { NavLeaf, Navigation, Notice, PortalApp, PortalLink } from "./types";

/**
 * 管理メニュー。各項目を見せるのに必要な権限(全社)を持つ。権限のない項目は表示しない
 * (表示を隠すだけでなく、各画面・Server Action でも同じ権限を本判定する)。
 */
export const ADMIN_NAV: (NavLeaf & { permission: string })[] = [
  { key: "employees", label: "社員管理", href: "/admin/employees", icon: "users", permission: "core.employees.manage" },
  { key: "organization", label: "組織管理", href: "/admin/organization", icon: "building", permission: "core.organization.manage" },
  { key: "roles", label: "権限管理", href: "/admin/roles", icon: "shield", permission: "core.roles.manage" },
  { key: "audiences", label: "Audience管理", href: "/admin/audiences", icon: "target", permission: "core.audiences.manage" },
  { key: "notices-admin", label: "お知らせ管理", href: "/admin/notices", icon: "megaphone", permission: "core.notices.manage" },
  { key: "links-admin", label: "社内リンク管理", href: "/admin/links", icon: "link", permission: "core.links.manage" },
  { key: "apps-admin", label: "アプリ管理", href: "/admin/apps", icon: "layers", permission: "core.apps.manage" },
  { key: "audit-logs", label: "監査ログ", href: "/admin/audit-logs", icon: "clipboard", permission: "core.audit.view" },
];

function unreadCount(notices: Notice[], channel: "personal" | "company"): number {
  return notices.filter((n) => noticeChannel(n) === channel && !n.isRead).length;
}

/**
 * サイドバーのメニューを組み立てる。
 * アプリは「ホームのアプリ一覧」と同じ(Audience 判定後の)リストから作るので、
 * 見えないアプリがメニューに出ることはない。管理メニューは管理者にだけ含める。
 */
export function buildNavigation(input: {
  /** 利用者が見られる管理メニュー(権限で絞り込み済み)。 */
  adminItems: NavLeaf[];
  apps: PortalApp[];
  notices: Notice[];
  links: PortalLink[];
}): Navigation {
  const { adminItems, apps, notices, links } = input;

  const sections: Navigation["sections"] = [
    // 開いてまず確認したいのは自分宛・全社のお知らせなので、アプリより上に置く。
    {
      key: "notices",
      en: "NOTICES",
      ja: "お知らせ",
      items: [
        {
          key: "notices-personal",
          label: "個人",
          href: "/notices/personal",
          icon: "bell",
          badge: unreadCount(notices, "personal"),
        },
        {
          key: "notices-company",
          label: "重要・全社",
          href: "/notices/company",
          icon: "megaphone",
          badge: unreadCount(notices, "company"),
        },
      ],
    },
    {
      key: "apps",
      en: "APPS",
      ja: "アプリ",
      items: apps.map((app) => ({
        key: app.appKey,
        label: app.displayName,
        href: app.href,
        icon: app.icon,
        external: app.external,
      })),
      emptyText: "利用できるアプリはまだありません",
    },
    {
      key: "links",
      en: "LINKS",
      ja: "社内リンク",
      items: links.map((link) => ({
        key: link.id,
        label: link.title,
        href: link.url,
        external: true,
      })),
      emptyText: "登録された社内リンクはありません",
    },
  ];

  if (adminItems.length > 0) {
    sections.push({
      key: "admin",
      en: "ADMIN",
      ja: "管理",
      items: adminItems,
      collapsible: true,
    });
  }

  return {
    home: { key: "home", label: "ホーム", href: "/", icon: "home" },
    sections,
  };
}
