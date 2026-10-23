import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAppAccess } from "@/modules/core/apps";
import { GUIDES } from "../guides";
import { findGuide, formatCheckedOn, groupGuides } from "../logic";
import { manifest } from "../manifest";
import { Blocks, Emphasized } from "./blocks";

// 手順書の画面(一覧 → 手順書)。中身はコードに持つ(guides/)ので DB は読まない。
// 入口は requireAppAccess("tejunsho")。見えない人は 404。

const BASE = "/apps/tejunsho";

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">{children}</div>;
}

function Eyebrow({ ja }: { ja: string }) {
  return (
    <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
      GUIDE
      <span className="text-brand04 ml-3 font-medium tracking-[0.1em]">{ja}</span>
    </p>
  );
}

/** 手順書の一覧(まとまりごと)。 */
export async function GuidesPage() {
  await requireAppAccess(manifest.appKey);
  const groups = groupGuides(GUIDES);

  return (
    <Shell>
      <div>
        <Eyebrow ja="手順書" />
        <h1 className="text-brand01 mt-2 text-2xl font-bold">手順書</h1>
        <p className="text-brand04 mt-1 text-sm">
          社内で使うシステムや作業の手順を、画面の表記どおりにまとめています。わからないときは、ここを開いてください。
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-brand04 bg-white p-6 text-sm">まだ手順書がありません。</p>
      ) : (
        groups.map((group) => (
          <section key={group.category} className="flex flex-col gap-3">
            <h2 className="text-brand01 border-brand03 border-l-4 pl-3 text-lg font-bold">{group.category}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {group.guides.map((guide) => (
                <li key={guide.slug}>
                  <Link
                    href={`${BASE}/${guide.slug}`}
                    className="border-brand01/15 hover:border-brand03 flex h-full flex-col gap-2 border bg-white p-4 transition-colors"
                  >
                    <span className="text-brand01 font-bold">{guide.title}</span>
                    <span className="text-brand04 text-sm">{guide.description}</span>
                    <span className="text-brand04 mt-auto text-xs">
                      全 {guide.sections.length} 項目 ・ {formatCheckedOn(guide.checkedOn)} 確認
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Shell>
  );
}

/** 1 つの手順書(要点 → 目次 → 本文 → 出典)。 */
export async function GuidePage({ slug }: { slug: string }) {
  await requireAppAccess(manifest.appKey);
  const guide = findGuide(GUIDES, slug);
  if (!guide) notFound();

  return (
    <Shell>
      <nav aria-label="現在地" className="text-brand04 flex flex-wrap items-center gap-1.5 text-xs">
        <Link href={BASE} className="hover:text-brand03 underline-offset-2 hover:underline">
          手順書
        </Link>
        <span aria-hidden>›</span>
        <span className="text-brand01 font-bold">{guide.title}</span>
      </nav>

      <header>
        <Eyebrow ja={guide.category} />
        <h1 className="text-brand01 mt-2 text-2xl font-bold md:text-3xl">{guide.title}</h1>
        <p className="text-brand04 mt-2 text-sm">{guide.description}</p>
        <p className="text-brand04 mt-1 text-xs">{formatCheckedOn(guide.checkedOn)} 時点の画面で確認</p>
      </header>

      {guide.highlights?.length ? (
        <section aria-label="要点" className="bg-brand01 flex flex-col gap-3 p-5 text-white">
          <p className="text-xs font-bold tracking-[0.2em] text-white/75">まずはここだけ</p>
          <ul className="flex flex-col gap-2">
            {guide.highlights.map((h) => (
              <li key={h} className="grid grid-cols-[1rem_1fr] gap-2 leading-relaxed">
                <span aria-hidden className="text-brand03 font-bold">
                  ●
                </span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav id="toc" aria-label="目次" className="flex scroll-mt-20 flex-col gap-3">
        <h2 className="text-brand01 border-brand03 border-l-4 pl-3 text-lg font-bold">目次</h2>
        <ol className="grid gap-2 sm:grid-cols-2">
          {guide.sections.map((section, i) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="border-brand01/15 hover:border-brand03 flex h-full items-baseline gap-3 border bg-white px-4 py-3 transition-colors"
              >
                <span className="text-brand03 text-sm font-bold tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="text-brand01 block font-bold">{section.title}</span>
                  {section.summary ? <span className="text-brand04 block text-xs">{section.summary}</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {guide.sections.map((section, i) => (
        <section key={section.id} id={section.id} className="flex scroll-mt-20 flex-col gap-5 bg-white p-5 md:p-7">
          <h2 className="text-brand01 flex items-baseline gap-3 text-xl font-bold">
            <span className="text-brand03 text-base tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            {section.title}
          </h2>
          {section.parts.map((part, j) => (
            <div key={j} className="flex flex-col gap-3">
              {part.title ? (
                <h3 className="text-brand01 border-brand01/15 border-b pb-1.5 font-bold">
                  <Emphasized text={part.title} />
                </h3>
              ) : null}
              <Blocks blocks={part.blocks} />
            </div>
          ))}
          <a href="#toc" className="text-brand04 hover:text-brand03 self-end text-xs transition-colors">
            ↑ 目次へ
          </a>
        </section>
      ))}

      {guide.sources.length ? (
        <footer className="text-brand04 flex flex-col gap-2 text-xs">
          <p>
            画面の表記は、会社の設定や、サービスの更新で変わることがあります。手順どおりにできないときは、管理者に相談してください。
          </p>
          <p className="font-bold">出典</p>
          <ul className="flex flex-col gap-1">
            {guide.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-brand03 underline underline-offset-2">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </footer>
      ) : null}
    </Shell>
  );
}
