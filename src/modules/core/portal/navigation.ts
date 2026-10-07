import { mockAdminItems } from "./mock-data";
import { noticeChannel } from "./notices";
import type { Navigation, Notice, PortalApp, PortalLink, PortalUser } from "./types";

function unreadCount(notices: Notice[], channel: "personal" | "company"): number {
  return notices.filter((n) => noticeChannel(n) === channel && !n.isRead).length;
}

/**
 * サイドバーのメニューを組み立てる。
 * アプリは「ホームのアプリ一覧」と同じ(Audience 判定後の)リストから作るので、
 * 見えないアプリがメニューに出ることはない。管理メニューは管理者にだけ含める。
 */
export function buildNavigation(input: {
  user: PortalUser;
  apps: PortalApp[];
  notices: Notice[];
  links: PortalLink[];
}): Navigation {
  const { user, apps, notices, links } = input;

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
      })),
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
    },
  ];

  if (user.isAdmin) {
    sections.push({
      key: "admin",
      en: "ADMIN",
      ja: "管理",
      items: mockAdminItems,
      collapsible: true,
    });
  }

  return {
    home: { key: "home", label: "ホーム", href: "/", icon: "home" },
    sections,
  };
}
