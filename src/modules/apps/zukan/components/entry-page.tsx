import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAppAccess } from "@/modules/core/apps";
import { CHAPTER_LABEL, CRITERIA, CRITERION_LABEL, RARITY_LABEL, formatNo } from "../constants";
import { manifest } from "../manifest";
import { getEntryDetail } from "../queries";
import { BeforeAfter } from "./before-after";
import { AppraisePanel, CommentForm, DeleteCommentButton, DeleteEntryButton, Reactions } from "./entry-controls";
import { Appraising, ChapterTag, DATE_FORMAT, EntryNo, RARITY_COLOR, Stars, TIME_FORMAT, rarityFrameStyle } from "./rarity";
import { RegisterScene } from "./register-scene";
import { RevealScene } from "./reveal-scene";

// 図鑑の 1 ページ(/apps/zukan/<id>)。docs/DESIGN.md 44 章。見られないページは 404(存在を知らせない)。
// 発見待ちは本人の続きの画面(/new?draft=)へ回す。

const photoSrc = (id: string) => `${manifest.route}/photos/${id}`;

export async function ZukanEntryPage({ entryId, isNew }: { entryId: string; isNew: boolean }) {
  const actor = await requireAppAccess(manifest.appKey);
  if (!z.uuid().safeParse(entryId).success) notFound();
  const entry = await getEntryDetail(actor, entryId);
  if (!entry) notFound();
  if (entry.status === "draft") {
    // 本人にしか見えない(canViewEntry)。続きは登録の画面で。
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 md:px-8 md:py-10">
        <p className="text-brand01 text-sm">このページは発見待ち(アフター待ち)です。</p>
        <Link href={`${manifest.route}/new?draft=${entry.id}`} className="text-brand01 hover:text-brand03 font-bold">
          続きを入力する →
        </Link>
      </div>
    );
  }

  const { access } = entry;
  const befores = entry.photos.filter((p) => p.kind === "before");
  const afters = entry.photos.filter((p) => p.kind === "after");
  const milestone = entry.number !== null && entry.number % 50 === 0;
  const reveal = access.isAuthor && entry.unseenReveal && entry.rarity !== null && entry.score !== null;
  const numberLabel = entry.number === null ? "No.???" : formatNo(entry.number);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      {isNew && access.isAuthor ? (
        <RegisterScene
          entryId={entry.id}
          numberLabel={numberLabel}
          title={entry.title}
          beforeSrc={befores[0] ? photoSrc(befores[0].id) : null}
          afterSrc={afters[0] ? photoSrc(afters[0].id) : null}
        />
      ) : null}

      <p className="text-sm">
        <Link href={access.isAuthor ? `${manifest.route}?view=mine` : manifest.route} className="text-brand01 hover:text-brand03 font-bold">
          ← 図鑑に戻る
        </Link>
      </p>

      <article className="flex flex-col gap-5 bg-white p-4 md:p-6" style={rarityFrameStyle(entry.rarity)}>
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2">
              <EntryNo number={entry.number} className="text-lg font-bold" />
              {milestone ? (
                <span className="border-brand03 text-brand03 border px-1.5 text-xs leading-5 font-bold">節目のページ</span>
              ) : null}
            </p>
            {entry.rarity ? <Stars rarity={entry.rarity} size="text-lg" /> : <Appraising />}
          </div>
          <h1 className="text-brand01 text-xl leading-snug font-black md:text-2xl">{entry.title}</h1>
          <p className="text-brand04 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {entry.chapter ? <ChapterTag chapter={entry.chapter} /> : null}
            <span>
              {entry.authorName}
              {entry.departmentName ? `(${entry.departmentName}${entry.locationName ? `・${entry.locationName}` : ""})` : ""}
            </span>
            <span>{DATE_FORMAT.format(new Date(entry.at))}</span>
          </p>
        </header>

        {befores[0] && afters[0] ? (
          <div className="flex flex-col gap-1.5">
            <BeforeAfter beforeSrc={photoSrc(befores[0].id)} afterSrc={photoSrc(afters[0].id)} />
            <p className="text-brand04 text-xs">境目を左右に動かすと、ビフォーとアフターを見比べられます。</p>
          </div>
        ) : null}
        {befores.length > 1 || afters.length > 1 ? (
          <ul className="grid grid-cols-4 gap-2" aria-label="写真">
            {[...befores, ...afters].map((p) => (
              <li key={p.id}>
                <a href={photoSrc(p.id)} target="_blank" rel="noreferrer" className="bg-field relative block aspect-square overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 見られる人だけ R2 へ転送する入口の画像 */}
                  <img src={photoSrc(p.id)} alt={p.kind === "before" ? "ビフォー" : "アフター"} loading="lazy" className="size-full object-cover" />
                  <span
                    className={
                      "absolute bottom-0 left-0 px-1 text-[10px] leading-4 font-bold " +
                      (p.kind === "before" ? "text-brand04 bg-white/90" : "bg-brand01 text-white")
                    }
                  >
                    {p.kind === "before" ? "BEFORE" : "AFTER"}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <dl className="flex flex-col gap-4 text-sm">
          {entry.what ? (
            <div className="flex flex-col gap-1">
              <dt className="text-brand01 font-bold">何をしたか</dt>
              <dd className="text-ink leading-relaxed whitespace-pre-wrap">{entry.what}</dd>
            </div>
          ) : null}
          {entry.effect ? (
            <div className="flex flex-col gap-1">
              <dt className="text-brand01 font-bold">効果</dt>
              <dd className="text-ink leading-relaxed whitespace-pre-wrap">{entry.effect}</dd>
            </div>
          ) : null}
          {entry.place ? (
            <div className="flex flex-col gap-1">
              <dt className="text-brand01 font-bold">場所</dt>
              <dd className="text-ink">{entry.place}</dd>
            </div>
          ) : null}
          {entry.chapter ? (
            <p className="text-brand04 text-xs">
              {CHAPTER_LABEL[entry.chapter].label}の章: {CHAPTER_LABEL[entry.chapter].hint}
            </p>
          ) : null}
        </dl>
      </article>

      <section className="border-brand01/15 flex flex-col gap-3 border bg-white p-4 md:p-5" aria-label="鑑定の結果">
        <h2 className="text-brand01 text-base font-bold">鑑定の結果</h2>
        {reveal ? (
          <RevealScene entryId={entry.id} rarity={entry.rarity!} score={entry.score!} />
        ) : entry.rarity && entry.score !== null ? (
          <div className="flex flex-col gap-3">
            <p className="flex flex-wrap items-baseline gap-3">
              <Stars rarity={entry.rarity} size="text-2xl" />
              <span className="text-sm font-bold" style={{ color: RARITY_COLOR[entry.rarity] }}>
                {RARITY_LABEL[entry.rarity]}
              </span>
              <span className="text-brand01 font-heading text-2xl font-bold tabular-nums">
                {entry.score}
                <span className="ml-1 font-sans text-sm">点</span>
              </span>
            </p>
            {entry.criteria ? (
              <ul className="text-brand04 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                {CRITERIA.map((c) => (
                  <li key={c}>
                    {CRITERION_LABEL[c].label} <span className="text-brand01 font-bold tabular-nums">{entry.criteria![c]}</span> / 5
                  </li>
                ))}
              </ul>
            ) : null}
            {entry.appraisalComment ? <p className="bg-bg01 text-ink px-3 py-2 text-sm whitespace-pre-wrap">{entry.appraisalComment}</p> : null}
            <p className="text-brand04 text-xs">
              鑑定: {entry.appraiserName ?? "—"}
              {entry.appraisedAt ? `(${TIME_FORMAT.format(new Date(entry.appraisedAt))})` : ""}
            </p>
          </div>
        ) : (
          <p className="text-brand04 text-sm">鑑定中です。点数とレア度は、鑑定が済むと開きます。</p>
        )}
      </section>

      {access.appraise ? (
        <AppraisePanel entryId={entry.id} aiReview={entry.aiReview} current={entry.criteria} currentComment={entry.appraisalComment} />
      ) : null}

      <section className="flex flex-col gap-4" aria-label="反応とコメント">
        <Reactions entryId={entry.id} reactions={entry.reactions} />
        {entry.comments.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {entry.comments.map((c) => (
              <li key={c.id} className="border-brand01/15 flex flex-col gap-1 border bg-white px-3 py-2">
                <p className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-brand01 font-bold">{c.authorName}</span>
                  <span className="text-brand04 flex items-center gap-3">
                    {TIME_FORMAT.format(new Date(c.createdAt))}
                    {c.isMine || access.manage ? <DeleteCommentButton commentId={c.id} /> : null}
                  </span>
                </p>
                <p className="text-ink text-sm whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <CommentForm entryId={entry.id} />
      </section>

      {access.manage ? <DeleteEntryButton entryId={entry.id} /> : null}
    </div>
  );
}
