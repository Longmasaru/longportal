import Link from "next/link";
import { requireAppAccess } from "@/modules/core/apps";
import { MEYASUBAKO_STATUSES, STATUS_LABEL, type MeyasubakoStatus } from "../constants";
import { manifest } from "../manifest";
import { canManagePosts, isResponder, listInbox, listMyPosts, listPublicPosts } from "../queries";
import { PostForm } from "./post-form";
import { PostList } from "./post-list";

// 目安箱の入口(docs/DESIGN.md 42 章)。「投稿する」「わたしの投稿」「みんなの投稿」と、
// 返事をする側(管理する人・リーダー)だけに「受け付けた投稿」のタブ(?tab=)。

export const MEYASUBAKO_TABS = ["post", "mine", "public", "inbox"] as const;
export type MeyasubakoTab = (typeof MEYASUBAKO_TABS)[number];

export function parseTab(v: unknown): MeyasubakoTab {
  return MEYASUBAKO_TABS.includes(v as MeyasubakoTab) ? (v as MeyasubakoTab) : "post";
}

/** 受け付けた投稿の絞り込み(?show=)。todo = 要対応、それ以外は状況。 */
export type InboxFilter = "all" | "todo" | MeyasubakoStatus;
export function parseInboxFilter(v: unknown): InboxFilter {
  if (v === "todo" || MEYASUBAKO_STATUSES.includes(v as MeyasubakoStatus)) return v as InboxFilter;
  return "all";
}

function TabLink({ tab, current, badge, children }: { tab: MeyasubakoTab; current: MeyasubakoTab; badge?: number; children: string }) {
  const active = tab === current;
  return (
    <Link
      href={tab === "post" ? manifest.route : `${manifest.route}?tab=${tab}`}
      aria-current={active ? "page" : undefined}
      className={
        "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-bold transition-colors " +
        (active ? "border-brand03 text-brand01" : "text-brand04 hover:text-brand03 border-transparent")
      }
    >
      {children}
      {badge ? <span className="bg-brand03 min-w-5 px-1.5 text-center text-xs leading-5 text-white tabular-nums">{badge}</span> : null}
    </Link>
  );
}

export async function MeyasubakoPage({ tab: requested, show }: { tab: MeyasubakoTab; show: InboxFilter }) {
  const actor = await requireAppAccess(manifest.appKey);
  const responder = isResponder(actor);
  const tab = requested === "inbox" && !responder ? "post" : requested;
  const [mine, inbox, publicPosts] = await Promise.all([
    listMyPosts(actor),
    responder ? listInbox(actor) : Promise.resolve([]),
    tab === "public" ? listPublicPosts(actor) : Promise.resolve([]),
  ]);
  const unread = mine.filter((p) => p.unreadForAuthor).length;
  const todo = inbox.filter((p) => p.needsResponder).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-col gap-2">
        <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">SUGGESTION BOX</p>
        <h1 className="text-brand01 text-2xl font-black md:text-3xl">目安箱</h1>
        <p className="text-brand01 text-sm">
          呼び止めなくても大丈夫。要望、ヒヤリハット、困りごと、欲しいものなど、気づいたことをここからひとこと送ってください。
        </p>
      </header>

      <nav aria-label="目安箱のタブ" className="border-brand01/15 -mx-4 flex overflow-x-auto border-b px-4 md:mx-0 md:px-0">
        <TabLink tab="post" current={tab}>
          投稿する
        </TabLink>
        <TabLink tab="mine" current={tab} badge={unread}>
          わたしの投稿
        </TabLink>
        <TabLink tab="public" current={tab}>
          みんなの投稿
        </TabLink>
        {responder ? (
          <TabLink tab="inbox" current={tab} badge={todo}>
            受け付けた投稿
          </TabLink>
        ) : null}
      </nav>

      {tab === "post" ? <PostForm /> : null}
      {tab === "mine" ? (
        <PostList posts={mine} mode="mine" empty="まだ投稿はありません。「投稿する」から送ると、ここに出ます。返事もここに届きます。" />
      ) : null}
      {tab === "public" ? (
        <>
          <p className="text-brand04 text-sm">「みんなに見えてOK」で送られた投稿と、会社からの返事です。</p>
          <PostList posts={publicPosts} mode="public" empty="公開された投稿はまだありません。" />
        </>
      ) : null}
      {tab === "inbox" ? (
        <Inbox posts={inbox} show={show} todo={todo} scopeNote={canManagePosts(actor) ? "全社の投稿" : "あなたの範囲のリーダー宛ての投稿"} />
      ) : null}
    </div>
  );
}

function Inbox({
  posts,
  show,
  todo,
  scopeNote,
}: {
  posts: Awaited<ReturnType<typeof listInbox>>;
  show: InboxFilter;
  todo: number;
  scopeNote: string;
}) {
  const filtered = posts.filter((p) => (show === "all" ? true : show === "todo" ? p.needsResponder : p.status === show));
  const filters: { key: InboxFilter; label: string; n: number }[] = [
    { key: "all", label: "すべて", n: posts.length },
    { key: "todo", label: "要対応", n: todo },
    ...MEYASUBAKO_STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], n: posts.filter((p) => p.status === s).length })),
  ];
  return (
    <section className="flex flex-col gap-4" aria-label="受け付けた投稿">
      <p className="text-brand04 text-sm">
        {scopeNote}です。匿名の投稿は、ここでも名前を出しません。
      </p>
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={`${manifest.route}?tab=inbox${f.key === "all" ? "" : `&show=${f.key}`}`}
            aria-current={show === f.key ? "true" : undefined}
            className={
              "border px-3 py-1 text-sm transition-colors " +
              (show === f.key ? "bg-brand01 border-brand01 font-bold text-white" : "border-brand01/20 text-brand01 hover:border-brand03 bg-white")
            }
          >
            {f.label} <span className="tabular-nums">{f.n}</span>
          </Link>
        ))}
      </div>
      <PostList posts={filtered} mode="inbox" empty="該当する投稿はありません。" />
    </section>
  );
}
