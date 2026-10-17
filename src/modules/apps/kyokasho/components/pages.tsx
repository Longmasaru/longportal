import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAppAccess } from "@/modules/core/apps";
import { LINK_CLASS, StatusTag } from "@/modules/core/shared/ui/form";
import { chapterOutline, countQuizQuestions } from "../content";
import { groupBooks } from "../logic";
import { manifest } from "../manifest";
import { canManageBooks, listBooksForActor, requireBookForActor } from "../queries";
import {
  canHandleComments,
  countCommentsByChapter,
  listChapterComments,
  loadTsukkomiOverview,
} from "../tsukkomi-queries";
import { Blocks, PHRASE_WRAP, Phrased } from "./blocks";
import { ChapterTsukkomi, TsukkomiOverview } from "./tsukkomi";
import { BODY_ID } from "./tsukkomi-client";

// ロングの教科書の画面(一覧 → 目次 → 章)。入口は requireAppAccess("kyokasho")、教科書ごとに見られる人を判定する。

const BASE = "/apps/kyokasho";

/** wide: 章のページ(本文・表・写真を PC で広く見せる)。 */
function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto flex w-full ${wide ? "max-w-6xl" : "max-w-4xl"} flex-col gap-8 px-4 py-8 md:px-8 md:py-10`}>
      {children}
    </div>
  );
}

function Eyebrow({ ja }: { ja: string }) {
  return (
    <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
      TEXTBOOK
      <span className="text-brand04 ml-3 font-medium tracking-[0.1em]">{ja}</span>
    </p>
  );
}

function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="現在地" className="text-brand04 flex flex-wrap items-center gap-1.5 text-xs">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 ? <span aria-hidden>›</span> : null}
          {item.href ? (
            <Link href={item.href} className="hover:text-brand03 underline-offset-2 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-brand01 font-bold">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function VisibilityTags({ book }: { book: { isPublished: boolean; target: string } }) {
  return (
    <>
      {!book.isPublished ? <StatusTag tone="attention">非公開</StatusTag> : null}
      {book.target === "audience" ? <StatusTag tone="info">見られる人を限定</StatusTag> : null}
    </>
  );
}

/** 教科書の一覧(部署ごと)。 */
export async function BooksPage() {
  const actor = await requireAppAccess(manifest.appKey);
  const books = await listBooksForActor(actor);
  const manage = canManageBooks(actor);
  const groups = groupBooks(books);
  const tsukkomi = await loadTsukkomiOverview(actor);

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow ja="ロングの教科書" />
          <h1 className="text-brand01 mt-2 text-2xl font-bold">ロングの教科書</h1>
          <p className="text-brand04 mt-1 text-sm">
            誰が見てもわかる「ロング流」のやり方をまとめた教科書です。章の終わりのテストで、理解できたかを確かめられます。
          </p>
        </div>
        {manage || tsukkomi.openCount !== null ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {tsukkomi.openCount !== null ? (
              <Link href={`${BASE}/manage/tsukkomi`} className={`${LINK_CLASS} inline-flex items-center gap-1.5`}>
                届いたツッコミ
                {tsukkomi.openCount > 0 ? (
                  <span className="bg-brand03 min-w-5 px-1 text-center text-xs leading-5 text-white tabular-nums">
                    {tsukkomi.openCount}
                  </span>
                ) : null}
                ›
              </Link>
            ) : null}
            {manage ? (
              <Link href={`${BASE}/manage`} className={LINK_CLASS}>
                教科書の管理 ›
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <TsukkomiOverview mine={tsukkomi.mine} contributors={tsukkomi.contributors} />

      {groups.length === 0 ? (
        <p className="text-brand04 bg-white p-6 text-sm">まだ教科書がありません。</p>
      ) : (
        groups.map((group) => (
          <section key={group.department} className="flex flex-col gap-3">
            <h2 className="text-brand01 border-brand03 border-l-4 pl-3 text-lg font-bold">{group.department}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {group.books.map((book) => (
                <li key={book.id}>
                  <Link
                    href={`${BASE}/${book.slug}`}
                    className="border-brand01/15 hover:border-brand03 flex h-full flex-col gap-2 border bg-white p-4 transition-colors"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-brand01 font-bold">{book.title}</span>
                      <VisibilityTags book={book} />
                    </span>
                    {book.description ? <span className="text-brand04 text-sm">{book.description}</span> : null}
                    <span className="text-brand04 mt-auto text-xs">全 {book.chapterCount} 章</span>
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

/** 教科書の目次。 */
export async function BookPage({ slug }: { slug: string }) {
  const actor = await requireAppAccess(manifest.appKey);
  const book = await requireBookForActor(actor, slug);
  const chapters = book.content.chapters;
  const commentCounts = await countCommentsByChapter(book.id);

  return (
    <Shell>
      <div className="flex flex-col gap-3">
        <Breadcrumb items={[{ href: BASE, label: "ロングの教科書" }, { label: `${book.department} ${book.title}` }]} />
        <Eyebrow ja={book.department} />
        <h1 className="text-brand01 flex flex-wrap items-center gap-3 text-2xl font-bold">
          {book.title}
          <VisibilityTags book={book} />
        </h1>
        {book.description ? <p className="text-brand04 text-sm">{book.description}</p> : null}
        {canManageBooks(actor) && book.sourceUrl ? (
          <a href={book.sourceUrl} target="_blank" rel="noopener noreferrer" className={`${LINK_CLASS} text-sm`}>
            元の Google ドキュメントを開く(編集する人向け)›
          </a>
        ) : null}
      </div>

      {chapters.length === 0 ? (
        <p className="text-brand04 bg-white p-6 text-sm">この教科書には、まだ章がありません。</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {chapters.map((chapter, i) => {
            const outline = chapterOutline(chapter).filter((h) => h.level === 2);
            const quiz = countQuizQuestions(chapter);
            return (
              <li key={i} className="border-brand01/15 border bg-white">
                <Link
                  href={`${BASE}/${book.slug}/${i + 1}`}
                  className="hover:text-brand03 text-brand01 flex flex-wrap items-baseline justify-between gap-2 p-4 font-bold transition-colors"
                >
                  <span className={PHRASE_WRAP}>
                    <Phrased text={chapter.title} />
                  </span>
                  {quiz > 0 || commentCounts.get(i + 1) ? (
                    <span className="text-brand04 flex gap-3 text-xs font-normal">
                      {commentCounts.get(i + 1) ? <span>ツッコミ {commentCounts.get(i + 1)} 件</span> : null}
                      {quiz > 0 ? <span>テスト {quiz} 問</span> : null}
                    </span>
                  ) : null}
                </Link>
                {outline.length > 0 ? (
                  <ul className="text-brand04 flex flex-wrap gap-x-4 gap-y-1 px-4 pb-4 text-sm">
                    {outline.map((h) => (
                      <li key={h.id}>
                        <Link href={`${BASE}/${book.slug}/${i + 1}#${h.id}`} className="hover:text-brand03">
                          {h.text}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </Shell>
  );
}

/** 章のページ。 */
export async function ChapterPage({ slug, chapter: chapterParam }: { slug: string; chapter: string }) {
  if (!/^[1-9][0-9]{0,2}$/.test(chapterParam)) notFound();
  const actor = await requireAppAccess(manifest.appKey);
  const book = await requireBookForActor(actor, slug);
  const index = Number(chapterParam) - 1;
  const chapters = book.content.chapters;
  const chapter = chapters[index];
  if (!chapter) notFound();
  const outline = chapterOutline(chapter).filter((h) => h.level <= 3);
  const comments = await listChapterComments(book.id, index + 1);
  const marks: Record<string, number> = Object.fromEntries(outline.map((h) => [h.id, 0]));
  for (const c of comments) if (c.sectionId && c.sectionId in marks) marks[c.sectionId] += 1;
  const prev = index > 0 ? index : null;
  const next = index + 1 < chapters.length ? index + 2 : null;

  return (
    <Shell wide>
      <div className="flex flex-col gap-3">
        <Breadcrumb
          items={[
            { href: BASE, label: "ロングの教科書" },
            {
              href: `${BASE}/${book.slug}`,
              label: `${book.department} ${book.title}`,
            },
            { label: chapter.title },
          ]}
        />
        <h1 className={`text-brand01 text-2xl font-bold md:text-3xl ${PHRASE_WRAP}`}>
          <Phrased text={chapter.title} />
        </h1>
      </div>

      {outline.length > 1 ? (
        <nav aria-label="この章の内容" className="border-brand01/15 border bg-white p-4">
          <p className="text-brand04 mb-2 text-xs font-bold tracking-widest">この章の内容</p>
          <ul className="flex flex-col gap-1 text-sm">
            {outline.map((h) => (
              <li key={h.id} className={h.level === 3 ? "pl-4" : ""}>
                <a href={`#${h.id}`} className={`text-brand01 hover:text-brand03 ${PHRASE_WRAP}`}>
                  <Phrased text={h.text.replace(/\*\*/g, "")} />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <article id={BODY_ID} className="flex flex-col gap-4">
        <Blocks
          blocks={chapter.blocks}
          quizKey={`kyokasho:${actor.userId}:${book.id}:${index + 1}`}
          marks={marks}
        />
      </article>

      <ChapterTsukkomi
        bookId={book.id}
        chapterNo={index + 1}
        sections={outline.map((h) => ({ id: h.id, level: h.level, text: h.text.replace(/\*\*/g, "") }))}
        comments={comments}
        userId={actor.userId}
        canHandle={canHandleComments(actor)}
      />

      <nav aria-label="章の移動" className="border-brand01/15 flex flex-wrap justify-between gap-3 border-t pt-6 text-sm">
        {prev ? (
          <Link href={`${BASE}/${book.slug}/${prev}`} className={LINK_CLASS}>
            ‹ {chapters[prev - 1].title}
          </Link>
        ) : (
          <Link href={`${BASE}/${book.slug}`} className={LINK_CLASS}>
            ‹ 目次へ
          </Link>
        )}
        {next ? (
          <Link href={`${BASE}/${book.slug}/${next}`} className={LINK_CLASS}>
            {chapters[next - 1].title} ›
          </Link>
        ) : (
          <Link href={`${BASE}/${book.slug}`} className={LINK_CLASS}>
            目次へ ›
          </Link>
        )}
      </nav>
    </Shell>
  );
}
