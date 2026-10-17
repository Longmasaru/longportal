import Link from "next/link";
import type { ReactNode } from "react";
import { toggleThanksAction } from "../tsukkomi-actions";
import {
  KIND_LABELS,
  STATUS_LABELS,
  canDeleteOwnComment,
  isCommentKind,
  type CommentStatus,
  type Contributor,
} from "../tsukkomi";
import type { CommentView, MyComment } from "../tsukkomi-queries";
import { BubbleIcon, DeleteCommentButton, HandleCommentForm, TsukkomiForm } from "./tsukkomi-client";

// ツッコミの表示(docs/DESIGN.md 32 章): 章の終わりの「この章へのツッコミ」、一覧のページの「あなたのツッコミ」「教科書をよくしてくれた人」。

const BASE = "/apps/kyokasho";

const dateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function KindTag({ kind }: { kind: string }) {
  const style =
    {
      question: "bg-bg01 text-brand01",
      addition: "bg-brand01 text-white",
      mistake: "bg-brand03 text-white",
      comment: "bg-field text-brand04",
    }[kind] ?? "bg-field text-brand04";
  return (
    <span className={`inline-block px-2 text-xs leading-6 font-bold whitespace-nowrap ${style}`}>
      {isCommentKind(kind) ? KIND_LABELS[kind].label : kind}
    </span>
  );
}

export function StatusBadge({ status }: { status: CommentStatus }) {
  const style = {
    open: "border-brand04/40 text-brand04",
    adopted: "border-brand03 text-brand03",
    reflected: "border-brand01 bg-brand01 text-white",
    kept: "border-brand01/30 text-brand01",
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 border px-2 text-xs leading-6 font-bold whitespace-nowrap ${style}`}>
      {status === "adopted" || status === "reflected" ? <span aria-hidden>★</span> : null}
      {STATUS_LABELS[status]}
    </span>
  );
}

function ThanksRow({ comment, userId }: { comment: CommentView; userId: string }) {
  const mine = comment.authorUserId === userId;
  const thanked = comment.thanks.some((t) => t.userId === userId);
  const names = comment.thanks.map((t) => t.name);
  const label = (
    <>
      <span aria-hidden>🙏</span>
      {thanked ? "ありがとうを送りました" : "ありがとう"}
      {names.length > 0 ? <span className="tabular-nums">{names.length}</span> : null}
    </>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {mine ? (
        names.length > 0 ? (
          <span className="text-brand01 inline-flex items-center gap-1.5 text-xs font-bold">{label}</span>
        ) : null
      ) : (
        <form action={toggleThanksAction}>
          <input type="hidden" name="id" value={comment.id} />
          <button
            type="submit"
            aria-pressed={thanked}
            className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-bold transition-colors ${
              thanked ? "border-brand03 bg-brand03/10 text-brand03" : "border-brand01/20 text-brand01 hover:border-brand03 hover:text-brand03 bg-white"
            }`}
          >
            {label}
          </button>
        </form>
      )}
      {names.length > 0 ? (
        <span className="text-brand04 text-xs">
          {names.slice(0, 5).join("・")}
          {names.length > 5 ? ` ほか ${names.length - 5} 人` : ""}
        </span>
      ) : null}
    </div>
  );
}

/** ツッコミ 1 件。where は、どこへのツッコミか(章の画面では節だけ、一覧では教科書と章も)。 */
export function CommentCard({
  comment,
  userId,
  canHandle,
  where,
  openHandle = false,
}: {
  comment: CommentView;
  userId: string;
  canHandle: boolean;
  where: ReactNode;
  openHandle?: boolean;
}) {
  const mine = comment.authorUserId === userId;
  return (
    <article className={`flex flex-col gap-3 border bg-white p-4 md:p-5 ${mine ? "border-brand01/40" : "border-brand01/15"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <KindTag kind={comment.kind} />
          <span className="text-brand04 min-w-0 text-xs">{where}</span>
        </div>
        <StatusBadge status={comment.status} />
      </div>

      <p className="font-prose text-ink leading-[1.8] break-words whitespace-pre-wrap">{comment.body}</p>

      <div className="text-brand04 flex flex-wrap items-center gap-x-2 text-xs">
        <span className="text-brand01 font-bold">{comment.authorName ?? "(退職などで消えた人)"}</span>
        {mine ? <span className="bg-bg01 text-brand01 px-1.5 leading-5 font-bold">あなた</span> : null}
        <span>{dateTime.format(comment.createdAt)}</span>
        {canDeleteOwnComment(comment, userId) ? (
          <span className="ml-auto">
            <DeleteCommentButton id={comment.id} />
          </span>
        ) : null}
      </div>

      {comment.reply ? (
        <div className="border-brand03 bg-bg01 border-l-4 px-3 py-2.5 md:px-4">
          <p className="text-brand01 mb-1 text-xs font-bold">
            教科書チームより{comment.repliedByName ? `(${comment.repliedByName})` : ""}
          </p>
          <p className="font-prose text-ink text-sm leading-[1.8] break-words whitespace-pre-wrap">{comment.reply}</p>
        </div>
      ) : null}

      <ThanksRow comment={comment} userId={userId} />

      {canHandle ? (
        <HandleCommentForm
          key={`${comment.status}:${comment.reply}`}
          id={comment.id}
          status={comment.status}
          reply={comment.reply}
          open={openHandle}
        />
      ) : null}
    </article>
  );
}

/** 章の終わりの「この章へのツッコミ」。 */
export function ChapterTsukkomi({
  bookId,
  chapterNo,
  sections,
  comments,
  userId,
  canHandle,
}: {
  bookId: string;
  chapterNo: number;
  sections: { id: string; level: number; text: string }[];
  comments: CommentView[];
  userId: string;
  canHandle: boolean;
}) {
  return (
    <section aria-labelledby="tsukkomi-heading" className="border-brand01/15 flex flex-col gap-5 border-t pt-8">
      <div className="flex flex-col gap-2">
        <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
          TSUKKOMI
          <span className="text-brand04 ml-3 font-medium tracking-[0.1em]">ツッコミ</span>
        </p>
        <h2 id="tsukkomi-heading" className="text-brand01 flex items-center gap-2 text-xl font-bold md:text-2xl">
          <BubbleIcon className="size-6" />
          この章へのツッコミ
          {comments.length > 0 ? <span className="text-brand04 text-base font-medium">{comments.length} 件</span> : null}
        </h2>
        <p className="text-brand04 text-sm leading-relaxed">
          「あれ?」「ここはこうでは?」と思ったら、気軽にツッコんでください。教科書チームが読んで返事をし、採用したら教科書を直します。
        </p>
      </div>

      <TsukkomiForm bookId={bookId} chapterNo={chapterNo} sections={sections} />

      {comments.length === 0 ? (
        <p className="text-brand04 bg-white p-5 text-center text-sm">まだツッコミはありません。最初のひとりになってください。</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id}>
              <CommentCard
                comment={c}
                userId={userId}
                canHandle={canHandle}
                where={
                  c.sectionId && sections.some((s) => s.id === c.sectionId) ? (
                    <a href={`#${c.sectionId}`} className="hover:text-brand03 underline-offset-2 hover:underline">
                      {c.sectionTitle}
                    </a>
                  ) : (
                    c.sectionTitle || "この章全体"
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function rankMark(i: number) {
  return ["🥇", "🥈", "🥉"][i] ?? `${i + 1}`;
}

/** 一覧のページ: あなたのツッコミ と 教科書をよくしてくれた人。 */
export function TsukkomiOverview({ mine, contributors }: { mine: MyComment[]; contributors: Contributor[] }) {
  if (mine.length === 0 && contributors.length === 0) return null;
  return (
    <section className="grid gap-4 md:grid-cols-[3fr_2fr]">
      <div className="border-brand01/15 flex flex-col gap-3 border bg-white p-4 md:p-5">
        <h2 className="text-brand01 flex items-center gap-2 font-bold">
          <BubbleIcon className="size-5" />
          あなたのツッコミ
        </h2>
        {mine.length === 0 ? (
          <p className="text-brand04 text-sm leading-relaxed">
            まだツッコミはありません。章のページの見出しの横の「ツッコむ」から、気づいたことを送れます。
          </p>
        ) : (
          <ul className="divide-brand01/10 flex flex-col divide-y">
            {mine.map((c) => (
              <li key={c.id} className="py-2.5 first:pt-0 last:pb-0">
                <Link
                  href={`${BASE}/${c.bookSlug}/${c.chapterNo}#tsukkomi`}
                  className="group flex flex-col gap-1.5"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <KindTag kind={c.kind} />
                    <StatusBadge status={c.status} />
                    {c.thanks.length > 0 ? (
                      <span className="text-brand01 text-xs font-bold">🙏 {c.thanks.length}</span>
                    ) : null}
                  </span>
                  <span className="text-ink group-hover:text-brand03 line-clamp-2 text-sm leading-relaxed">{c.body}</span>
                  <span className="text-brand04 text-xs">
                    {c.bookTitle} ・ {c.chapterTitle}
                  </span>
                  {c.reply ? (
                    <span className="border-brand03 bg-bg01 text-ink block border-l-4 px-2.5 py-1.5 text-xs leading-relaxed">
                      <span className="line-clamp-2">
                        <span className="text-brand01 font-bold">教科書チームより: </span>
                        {c.reply}
                      </span>
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-brand01/15 flex flex-col gap-3 border bg-white p-4 md:p-5">
        <div>
          <h2 className="text-brand01 font-bold">教科書をよくしてくれた人</h2>
          <p className="text-brand04 mt-0.5 text-xs">ツッコミの数と、採用されて教科書に入った数(★)です。</p>
        </div>
        {contributors.length === 0 ? (
          <p className="text-brand04 text-sm">まだいません。</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {contributors.slice(0, 10).map((c, i) => (
              <li key={c.userId} className="flex items-center gap-3 text-sm">
                <span className="text-brand04 w-6 shrink-0 text-center tabular-nums">{rankMark(i)}</span>
                <span className="text-brand01 min-w-0 flex-1 truncate font-bold">{c.name}</span>
                <span className="text-brand04 shrink-0 text-xs tabular-nums">ツッコミ {c.count}</span>
                <span
                  className={`w-12 shrink-0 text-right text-xs font-bold tabular-nums ${c.adopted > 0 ? "text-brand03" : "text-brand04/50"}`}
                >
                  ★ {c.adopted}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
