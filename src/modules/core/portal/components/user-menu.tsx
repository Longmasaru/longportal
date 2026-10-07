"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/modules/core/auth/actions";
import type { PortalUser } from "../types";
import { Icon } from "./icons";

export function UserMenu({ user }: { user: PortalUser }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-bg01 flex items-center gap-2.5 rounded-full py-1 pr-2.5 pl-1 transition-colors"
      >
        <span
          aria-hidden="true"
          className="bg-brand01 flex size-8 items-center justify-center rounded-full text-sm font-bold text-white"
        >
          {user.displayName.slice(0, 1)}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="text-brand01 block text-sm font-bold">{user.displayName}</span>
          <span className="text-brand04 block text-xs">
            {user.subtitle}
          </span>
        </span>
        <Icon name="chevron-down" size={16} className="text-brand04" />
      </button>

      {open ? (
        <div
          role="menu"
          className="border-brand01/20 absolute right-0 z-40 mt-2 w-64 border bg-white"
        >
          <div className="border-brand01/15 border-b px-4 py-3">
            <p className="text-brand01 text-sm font-bold">{user.displayName}</p>
            <p className="text-brand04 text-xs">
              {user.employeeNumber ? `社員番号 ${user.employeeNumber} ・ ` : ""}
              {user.subtitle}
            </p>
            <p className="mt-2 flex flex-wrap gap-1">
              {user.roleNames.map((role) => (
                <span
                  key={role}
                  className="bg-bg01 text-brand01 px-1.5 text-xs leading-5 font-bold"
                >
                  {role}
                </span>
              ))}
            </p>
          </div>
          <ul className="py-1">
            <li>
              <Link
                href="/password"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="text-brand01 hover:bg-bg01 hover:text-brand03 flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors"
              >
                <Icon name="key" size={18} />
                パスワードを変更
              </Link>
            </li>
            <li>
              <form action={signOutAction}>
                <button
                  type="submit"
                  role="menuitem"
                  className="text-brand01 hover:bg-bg01 hover:text-brand03 flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors"
                >
                  <Icon name="logout" size={18} />
                  ログアウト
                </button>
              </form>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
