"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { Navigation, PortalUser } from "../types";
import { Icon } from "./icons";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

/**
 * ポータル共通の枠(上部ヘッダー + 左サイドバー)。
 * モバイルではサイドバーをドロワーとして開閉するため、開閉状態だけをここで持つ。
 * children(各ページの中身)は Server Component のまま渡される。
 */
export function PortalFrame({
  user,
  navigation,
  children,
}: {
  user: PortalUser;
  navigation: Navigation;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="focus:text-brand01 sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3"
      >
        本文へ移動
      </a>

      <header className="border-brand01/15 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-white px-3 md:px-5">
        <button
          type="button"
          aria-label={navOpen ? "メニューを閉じる" : "メニューを開く"}
          aria-expanded={navOpen}
          aria-controls="portal-sidebar"
          onClick={() => setNavOpen((v) => !v)}
          className="text-brand01 hover:bg-bg01 -ml-1 p-2 transition-colors lg:hidden"
        >
          <Icon name={navOpen ? "close" : "menu"} size={22} />
        </button>

        <Link href="/" className="group flex items-baseline gap-3">
          <span className="font-heading text-brand01 group-hover:text-brand03 text-xl font-black tracking-[0.12em] transition-colors">
            LONG PORTAL
          </span>
          <span className="text-brand04 hidden text-xs tracking-[0.15em] md:inline">
            株式会社ロング
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          {user.roleNames.map((role) => (
            <span
              key={role}
              className="text-brand01 border-brand01/30 hidden border px-2 text-xs leading-5 font-bold md:inline"
            >
              {role}
            </span>
          ))}
          <UserMenu user={user} />
        </div>
      </header>

      <div className="flex flex-1">
        {navOpen ? (
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => setNavOpen(false)}
            className="fixed inset-x-0 top-14 bottom-0 z-10 bg-black/30 lg:hidden"
          />
        ) : null}

        <aside
          id="portal-sidebar"
          className={`bg-bg01 fixed top-14 bottom-0 left-0 z-20 flex w-64 flex-col overflow-y-auto transition-transform duration-200 lg:sticky lg:top-14 lg:bottom-auto lg:h-[calc(100dvh-3.5rem)] lg:shrink-0 lg:translate-x-0 ${
            navOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarNav navigation={navigation} onNavigate={() => setNavOpen(false)} />
          <p className="text-brand04 mt-auto px-4 pb-4 text-xs leading-relaxed">
            UIモック表示中
            <br />
            表示内容は仮のデータです
          </p>
        </aside>

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
