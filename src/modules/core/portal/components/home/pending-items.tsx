import Link from "next/link";
import type { PendingItem } from "../../types";
import { Icon } from "../icons";
import { SectionHeading } from "../section-heading";

/** 要対応(PENDING)。該当がないときは何も描画しない(「0件です」を毎日見せない)。 */
export function PendingItems({ items }: { items: PendingItem[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="pending-heading">
      <SectionHeading id="pending-heading" en="PENDING" ja="要対応" />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.appKey}>
            <Link
              href={item.href}
              className="group border-brand01/20 hover:border-brand01 flex h-full items-center gap-3 border bg-white px-4 py-3.5 transition-colors"
            >
              <span className="bg-bg01 text-brand01 flex size-10 shrink-0 items-center justify-center">
                <Icon name={item.icon} size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-brand01 group-hover:text-brand03 block font-bold transition-colors">
                  {item.appName}
                </span>
                <span className="bg-brand03 mt-0.5 inline-block px-1.5 text-xs leading-5 font-bold text-white">
                  {item.label}
                </span>
              </span>
              <Icon
                name="chevron-right"
                size={18}
                className="text-brand04 group-hover:text-brand03 shrink-0 transition-colors"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
