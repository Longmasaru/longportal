"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavLeaf, NavSection, Navigation } from "../types";
import { Icon } from "./icons";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ITEM_BASE =
  "relative flex items-center gap-3 py-1.5 pr-3 pl-3 text-sm transition-colors";

function NavBadge({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="bg-brand03 min-w-5 px-1.5 text-center text-xs leading-5 font-bold text-white">
      {count}
    </span>
  );
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavLeaf;
  pathname: string;
  onNavigate: () => void;
}) {
  // 外部リンク(社内リンク): 別タブで開く。現在地にはならない。
  if (item.external) {
    return (
      <li>
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`${ITEM_BASE} text-brand01 hover:text-brand03 font-medium hover:bg-white/60`}
        >
          <span className="w-[18px] shrink-0" aria-hidden="true" />
          <span className="flex-1">{item.label}</span>
          <Icon name="external" size={14} className="text-brand04 shrink-0" />
          <span className="sr-only">(新しいタブで開きます)</span>
        </a>
      </li>
    );
  }

  const active = isActive(pathname, item.href);
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`${ITEM_BASE} ${
          active
            ? "text-brand01 bg-white font-bold"
            : "text-brand01 hover:text-brand03 font-medium hover:bg-white/60"
        }`}
      >
        {active ? (
          <span aria-hidden="true" className="bg-brand03 absolute inset-y-0 left-0 w-[3px]" />
        ) : null}
        {item.icon ? (
          <Icon name={item.icon} size={18} className="shrink-0" />
        ) : (
          <span className="w-[18px] shrink-0" aria-hidden="true" />
        )}
        <span className="flex-1">{item.label}</span>
        <NavBadge count={item.badge} />
      </Link>
    </li>
  );
}

function SectionLabel({ section }: { section: NavSection }) {
  return (
    <>
      <span className="font-heading text-xs font-bold tracking-[0.2em]">{section.en}</span>
      <span className="font-body ml-2 text-xs font-medium tracking-[0.1em]">{section.ja}</span>
    </>
  );
}

function Section({
  section,
  pathname,
  onNavigate,
}: {
  section: NavSection;
  pathname: string;
  onNavigate: () => void;
}) {
  // 折りたたみ可能なセクションは、閉じていても現在地の項目があれば開いた状態で始める。
  const containsCurrent = section.items.some(
    (item) => !item.external && isActive(pathname, item.href),
  );
  const [open, setOpen] = useState(containsCurrent);
  const listId = `nav-section-${section.key}`;

  const list = (
    <ul id={listId}>
      {section.items.map((item) => (
        <NavLink key={item.key} item={item} pathname={pathname} onNavigate={onNavigate} />
      ))}
    </ul>
  );

  if (!section.collapsible) {
    return (
      <div>
        <p className="text-brand04 px-3 pb-1">
          <SectionLabel section={section} />
        </p>
        {list}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="text-brand04 hover:text-brand03 flex w-full items-center px-3 pb-1 text-left transition-colors"
      >
        <span className="flex-1">
          <SectionLabel section={section} />
        </span>
        <Icon
          name="chevron-down"
          size={16}
          className={`transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open ? list : null}
    </div>
  );
}

export function SidebarNav({
  navigation,
  onNavigate,
}: {
  navigation: Navigation;
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="メインメニュー" className="flex flex-col gap-5 py-4">
      <ul>
        <NavLink item={navigation.home} pathname={pathname} onNavigate={onNavigate} />
      </ul>
      {navigation.sections.map((section) => (
        <Section
          key={section.key}
          section={section}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}
