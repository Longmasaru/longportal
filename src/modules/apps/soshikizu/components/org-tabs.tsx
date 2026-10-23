import Link from "next/link";

const TABS = [
  { key: "chart", href: "/apps/soshikizu", label: "組織図" },
  { key: "map", href: "/apps/soshikizu/haichi", label: "配置図" },
] as const;

/** 組織図アプリの上のタブ(組織図 / 配置図)。 */
export function OrgTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="組織図の表示" className="border-brand01/15 flex gap-1 border-b">
      {TABS.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold transition-colors ${
              on ? "border-brand03 text-brand01" : "text-brand04 hover:text-brand03 border-transparent"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
