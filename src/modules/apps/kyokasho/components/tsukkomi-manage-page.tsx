import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppAccess } from "@/modules/core/apps";
import { googleServiceAccount } from "@/modules/core/google";
import { LINK_CLASS, PageHeading } from "@/modules/core/shared/ui/form";
import { manifest } from "../manifest";
import { COMMENT_STATUSES, STATUS_LABELS, isCommentStatus, type CommentStatus } from "../tsukkomi";
import { canHandleComments, listCommentsAdmin } from "../tsukkomi-queries";
import { CommentCard } from "./tsukkomi";
import { GooglePushButton } from "./tsukkomi-google-button";

const BASE = "/apps/kyokasho";

/** 教科書チームの画面: 届いたツッコミを読み、返事をし、採用を決める。kyokasho.comments.manage か kyokasho.books.manage が必要。 */
export async function TsukkomiManagePage({ status: statusParam }: { status?: string }) {
  const actor = await requireAppAccess(manifest.appKey);
  if (!canHandleComments(actor)) notFound();
  const status: CommentStatus | "all" =
    statusParam === "all" ? "all" : statusParam && isCommentStatus(statusParam) ? statusParam : "open";
  const { comments, counts } = await listCommentsAdmin(status);
  const tabs: { key: CommentStatus | "all"; label: string }[] = [
    ...COMMENT_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s] })),
    { key: "all", label: "すべて" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="届いたツッコミ"
        description="読んだ人からの疑問・付け足し・まちがいの指摘です。返事(お礼)を書き、採用するものは元の Google ドキュメントを直して取り込み直し、「教科書に反映済み」にしてください。"
        aside={
          <Link href={BASE} className={LINK_CLASS}>
            ‹ 教科書の一覧へ
          </Link>
        }
      />

      {googleServiceAccount() ? <GooglePushButton /> : null}

      <nav aria-label="受け止め方で絞る" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="border-brand01/15 flex min-w-max gap-1 border-b">
          {tabs.map((t) => {
            const on = t.key === status;
            const n = counts[t.key] ?? 0;
            return (
              <li key={t.key}>
                <Link
                  href={`${BASE}/manage/tsukkomi?status=${t.key}`}
                  aria-current={on ? "page" : undefined}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-bold whitespace-nowrap transition-colors ${
                    on ? "border-brand03 text-brand01" : "text-brand04 hover:text-brand01 border-transparent"
                  }`}
                >
                  {t.label}
                  <span
                    className={`min-w-5 px-1 text-center text-xs leading-5 tabular-nums ${
                      on && t.key === "open" && n > 0 ? "bg-brand03 text-white" : "bg-field text-brand04"
                    }`}
                  >
                    {n}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {comments.length === 0 ? (
        <p className="text-brand04 bg-white p-6 text-center text-sm">
          {status === "open" ? "返事待ちのツッコミはありません。" : "ありません。"}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id}>
              <CommentCard
                comment={c}
                userId={actor.userId}
                canHandle
                openHandle={c.status === "open"}
                where={
                  <Link
                    href={`${BASE}/${c.bookSlug}/${c.chapterNo}${c.sectionId ? `#${c.sectionId}` : "#tsukkomi"}`}
                    className="hover:text-brand03 underline-offset-2 hover:underline"
                  >
                    {c.bookTitle} › {c.chapterTitle}
                    {c.sectionTitle ? ` › ${c.sectionTitle}` : ""}
                  </Link>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
