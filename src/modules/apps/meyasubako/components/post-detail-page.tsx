import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAppAccess } from "@/modules/core/apps";
import { FormNotice } from "@/modules/core/shared/ui/form";
import { DESTINATION_LABEL, VISIBILITY_LABEL } from "../constants";
import { manifest } from "../manifest";
import { canManagePosts, getPostDetail } from "../queries";
import { DeletePostButton, MarkRead, ReplyForm, StatusControl } from "./post-controls";
import { CategoryTag, StatusBadge, TIME_FORMAT } from "./post-list";

/** 投稿の詳細(/apps/meyasubako/<id>)。見られない投稿は 404(存在を知らせない)。 */
export async function MeyasubakoPostPage({ postId, sent }: { postId: string; sent: boolean }) {
  const actor = await requireAppAccess(manifest.appKey);
  if (!z.uuid().safeParse(postId).success) notFound();
  const post = await getPostDetail(actor, postId);
  if (!post) notFound();
  const { access } = post;
  const back = access.respond && !access.isAuthor ? "?tab=inbox" : access.isAuthor ? "?tab=mine" : "?tab=public";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <MarkRead postId={post.id} />
      <p className="text-sm">
        <Link href={`${manifest.route}${back}`} className="text-brand01 hover:text-brand03 font-bold">
          ← 目安箱に戻る
        </Link>
      </p>

      {sent && access.isAuthor ? (
        <FormNotice tone="success">
          目安箱に入れました。ありがとうございます。返事が届くと、ホームと「わたしの投稿」でお知らせします。
        </FormNotice>
      ) : null}

      <article className="border-brand01/15 flex flex-col gap-4 border bg-white px-5 py-5">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <CategoryTag category={post.category} />
          <StatusBadge status={post.status} />
          <span className="border-brand04/40 text-brand04 border px-1.5 text-xs leading-5">
            {VISIBILITY_LABEL[post.visibility].label}
          </span>
          <span className="text-brand04 text-xs">{DESTINATION_LABEL[post.destination]}</span>
        </p>
        <p className="text-brand01 text-lg leading-relaxed break-words whitespace-pre-wrap">{post.body || "(写真のみ)"}</p>
        {post.photoIds.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {post.photoIds.map((id) => (
              <a key={id} href={`${manifest.route}/photos/${id}`} target="_blank" rel="noopener" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- 見られる人だけ R2 へ転送する入口の画像 */}
                <img src={`${manifest.route}/photos/${id}`} alt="添付された写真" className="bg-field size-32 object-cover md:size-40" />
              </a>
            ))}
          </div>
        ) : null}
        <dl className="text-brand04 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt>送った人</dt>
          <dd className="text-brand01">
            {post.authorName ?? "匿名"}
            {access.isAuthor && post.anonymous ? "(匿名で送信。ほかの人には名前は出ません)" : ""}
          </dd>
          {post.departmentName ? (
            <>
              <dt>所属(送った時点)</dt>
              <dd className="text-brand01">
                {post.departmentName}
                {post.locationName ? ` / ${post.locationName}` : ""}
              </dd>
            </>
          ) : null}
          {post.place ? (
            <>
              <dt>場所</dt>
              <dd className="text-brand01">{post.place}</dd>
            </>
          ) : null}
          <dt>送った日時</dt>
          <dd className="text-brand01">
            <time dateTime={post.createdAt}>{TIME_FORMAT.format(new Date(post.createdAt))}</time>
          </dd>
        </dl>
        {access.respond ? <StatusControl postId={post.id} status={post.status} /> : null}
      </article>

      <section className="flex flex-col gap-3" aria-labelledby="meyasubako-thread">
        <h2 id="meyasubako-thread" className="text-brand01 text-base font-bold">
          やり取り
        </h2>
        {post.messages.length === 0 ? (
          <p className="bg-bg01 text-brand04 px-4 py-4 text-sm">
            {access.isAuthor ? "まだ返事はありません。返事が届くと、ここに出ます。" : "まだやり取りはありません。"}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {post.messages.map((m) => (
              <li
                key={m.id}
                className={
                  "flex max-w-[88%] flex-col gap-1 px-4 py-2.5 " +
                  (m.fromResponder ? "bg-bg01 self-start" : "border-brand01/15 self-end border bg-white")
                }
              >
                <span className="text-brand04 text-xs">
                  {m.fromResponder ? `会社より(${m.authorName})` : m.authorName}・
                  <time dateTime={m.createdAt}>{TIME_FORMAT.format(new Date(m.createdAt))}</time>
                </span>
                <span className="text-brand01 break-words whitespace-pre-wrap">{m.body}</span>
              </li>
            ))}
          </ul>
        )}
        {access.message ? <ReplyForm postId={post.id} asResponder={!access.isAuthor} /> : null}
        {post.visibility === "public" && access.respond && !access.isAuthor ? (
          <p className="text-brand04 text-xs">この投稿は「みんなに見えてOK」なので、返事も全社員が読めます。</p>
        ) : null}
      </section>

      {canManagePosts(actor) ? <DeletePostButton postId={post.id} /> : null}
    </div>
  );
}
