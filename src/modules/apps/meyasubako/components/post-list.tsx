import Link from "next/link";
import { CATEGORY_LABEL, DESTINATION_LABEL, STATUS_LABEL, type MeyasubakoCategory, type MeyasubakoStatus } from "../constants";
import type { PostSummary } from "../queries";

// 投稿の一覧(わたしの投稿・みんなの投稿・受け付けた投稿で共通)。各行は詳細のページへのリンク。

export const TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function CategoryTag({ category }: { category: MeyasubakoCategory }) {
  return (
    <span
      className={
        "px-2 text-xs leading-5 font-bold " +
        (category === "hazard" ? "bg-brand03 text-white" : "bg-bg01 text-brand01")
      }
    >
      {CATEGORY_LABEL[category].label}
    </span>
  );
}

const STATUS_STYLE: Record<MeyasubakoStatus, string> = {
  new: "border-brand03 text-brand03",
  seen: "border-brand01/40 text-brand01",
  doing: "border-brand01 text-brand01",
  done: "border-brand04/40 text-brand04",
};

export function StatusBadge({ status }: { status: MeyasubakoStatus }) {
  return <span className={`border px-1.5 text-xs leading-5 font-bold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function NewDot({ label }: { label: string }) {
  return (
    <span className="bg-brand03 inline-block size-2.5 shrink-0 rounded-full" role="img" aria-label={label} title={label} />
  );
}

export function PostList({
  posts,
  empty,
  mode,
}: {
  posts: PostSummary[];
  empty: string;
  /** mine = 自分の投稿 / public = みんなの投稿 / inbox = 返事をする側 */
  mode: "mine" | "public" | "inbox";
}) {
  if (posts.length === 0) return <p className="bg-bg01 text-brand01 px-4 py-6 text-center text-sm">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {posts.map((p) => {
        const dot = mode === "inbox" ? p.needsResponder : mode === "mine" ? p.unreadForAuthor : false;
        return (
          <li key={p.id}>
            <Link
              href={`/apps/meyasubako/${p.id}`}
              className={
                "hover:border-brand03 flex flex-col gap-1.5 border bg-white px-4 py-3 transition-colors " +
                (p.category === "hazard" ? "border-brand03/50" : "border-brand01/15")
              }
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                {dot ? <NewDot label={mode === "inbox" ? "要対応" : "新しい返事"} /> : null}
                <CategoryTag category={p.category} />
                <StatusBadge status={p.status} />
                {mode !== "public" ? (
                  <span className="border-brand04/40 text-brand04 border px-1.5 text-xs leading-5">
                    {p.visibility === "public" ? "みんなに公開" : "管理者だけ"}
                  </span>
                ) : null}
                {p.destination === "leader" ? (
                  <span className="text-brand04 text-xs">{DESTINATION_LABEL[p.destination]}</span>
                ) : null}
              </span>
              <span className="text-brand01 line-clamp-2 break-words whitespace-pre-wrap">{p.body || "(写真のみ)"}</span>
              <span className="text-brand04 flex flex-wrap gap-x-3 text-xs">
                <time dateTime={p.createdAt}>{TIME_FORMAT.format(new Date(p.createdAt))}</time>
                {mode !== "mine" ? <span>{p.authorName ?? "匿名"}</span> : p.anonymous ? <span>匿名で送信</span> : null}
                {mode === "inbox" && p.departmentName ? <span>{p.departmentName}</span> : null}
                {p.place ? <span>場所: {p.place}</span> : null}
                {p.photoCount > 0 ? <span>写真 {p.photoCount}枚</span> : null}
                {p.messageCount > 0 ? <span>やり取り {p.messageCount}件</span> : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
