import Link from "next/link";
import type { Notice } from "../../types";
import { Icon } from "../icons";

/**
 * 緊急・重要な全社連絡のバナー。該当がないときは何も描画しない。
 * 通常の全社連絡はここに出さない(サイドバーの「重要・全社」で確認する)。
 */
export function UrgentBanner({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;

  return (
    <section aria-label="緊急のお知らせ" className="flex flex-col gap-3">
      {notices.map((notice) => (
        <div
          key={notice.id}
          role="alert"
          className="bg-brand03/10 border-brand03 flex items-start gap-3 border border-l-4 px-4 py-3.5"
        >
          <Icon name="alert" size={22} className="text-brand03 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="bg-brand03 px-1.5 text-xs leading-5 font-bold text-white">
                緊急
              </span>
              <span className="text-brand01 font-bold">{notice.title}</span>
            </p>
            <p className="text-brand04 mt-1 text-sm leading-relaxed">{notice.summary}</p>
          </div>
          <Link
            href={notice.href}
            className="text-brand01 hover:text-brand03 shrink-0 self-center text-sm font-bold whitespace-nowrap transition-colors"
          >
            詳細を見る
          </Link>
        </div>
      ))}
    </section>
  );
}
