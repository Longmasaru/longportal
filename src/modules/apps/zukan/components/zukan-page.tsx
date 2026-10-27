import Link from "next/link";
import { requireAppAccess } from "@/modules/core/apps";
import { BUTTON_PRIMARY } from "@/modules/core/shared/ui/form";
import {
  CHAPTER_LABEL,
  CRITERIA,
  CRITERION_LABEL,
  ZUKAN_CHAPTERS,
  formatNo,
  milestoneOf,
  scoreOf,
  type ZukanChapter,
} from "../constants";
import { manifest } from "../manifest";
import { canAppraise, coverStats, listAppraiseQueue, listMine, listPublished } from "../queries";
import { EntryCard, EntryGrid } from "./entry-card";

// カイゼン図鑑の入口(docs/DESIGN.md 44 章)。表紙と一覧(?ch= で章)、自分の図鑑(?view=mine)、
// 鑑定する人だけに鑑定待ち(?view=appraise)。

export const ZUKAN_VIEWS = ["all", "mine", "appraise"] as const;
export type ZukanView = (typeof ZUKAN_VIEWS)[number];

export function parseView(v: unknown): ZukanView {
  return ZUKAN_VIEWS.includes(v as ZukanView) ? (v as ZukanView) : "all";
}

export function parseChapter(v: unknown): ZukanChapter | null {
  return ZUKAN_CHAPTERS.includes(v as ZukanChapter) ? (v as ZukanChapter) : null;
}

/** 表紙に出す、次の節目の番号(50 ごと)。あと 5 ページ以内のときだけ。 */
function nextMilestone(total: number): { number: number; left: number } | null {
  const next = (Math.floor(total / 50) + 1) * 50;
  const left = next - total;
  return left <= 5 ? { number: next, left } : null;
}

function TabLink({ view, current, badge, children }: { view: ZukanView; current: ZukanView; badge?: number; children: string }) {
  const active = view === current;
  return (
    <Link
      href={view === "all" ? manifest.route : `${manifest.route}?view=${view}`}
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

export async function ZukanPage({ view: requested, chapter }: { view: ZukanView; chapter: ZukanChapter | null }) {
  const actor = await requireAppAccess(manifest.appKey);
  const appraiser = canAppraise(actor);
  const view = requested === "appraise" && !appraiser ? "all" : requested;
  const [stats, mine, queue, entries] = await Promise.all([
    coverStats(actor.today),
    listMine(actor),
    appraiser ? listAppraiseQueue(actor) : Promise.resolve([]),
    view === "all" ? listPublished(actor, chapter) : Promise.resolve([]),
  ]);
  const reveals = mine.filter((e) => e.unseenReveal).length;
  const milestone = nextMilestone(stats.total);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">KAIZEN ZUKAN</p>
          <h1 className="text-brand01 text-2xl font-black md:text-3xl">カイゼン図鑑</h1>
          <p className="text-brand01 text-sm">ちょっとした改善を、ビフォーとアフターで 1 ページずつ。みんなの工夫が増えていく図鑑です。</p>
        </div>
        <div className="flex items-end gap-6">
          <p className="flex flex-col">
            <span className="text-brand04 text-xs">登録</span>
            <span className="text-brand01 font-heading text-4xl leading-none font-bold tabular-nums">
              {stats.total}
              <span className="ml-1 font-sans text-sm font-bold">ページ</span>
            </span>
          </p>
          <p className="flex flex-col">
            <span className="text-brand04 text-xs">今月</span>
            <span className="text-brand03 font-heading text-2xl leading-none font-bold tabular-nums">+{stats.thisMonth}</span>
          </p>
        </div>
      </header>

      {milestone ? (
        <p className="border-brand01/15 text-brand01 border-l-4 bg-white px-4 py-2 text-sm">
          あと <strong className="tabular-nums">{milestone.left}</strong> ページで <strong>{formatNo(milestone.number)}</strong>。
          節目のページには、記念の印が付きます。
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="カイゼン図鑑のタブ" className="border-brand01/15 -mx-4 flex flex-1 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
          <TabLink view="all" current={view}>
            図鑑
          </TabLink>
          <TabLink view="mine" current={view} badge={reveals}>
            自分の図鑑
          </TabLink>
          {appraiser ? (
            <TabLink view="appraise" current={view} badge={queue.length}>
              鑑定待ち
            </TabLink>
          ) : null}
        </nav>
        <Link href={`${manifest.route}/new`} className={`${BUTTON_PRIMARY} px-6`}>
          ＋ 登録する
        </Link>
      </div>

      {view === "all" ? (
        <>
          <ChapterFilter current={chapter} counts={stats.byChapter} total={stats.total} />
          <EntryGrid
            entries={entries}
            empty={
              chapter
                ? `「${CHAPTER_LABEL[chapter].label}」の章には、まだページがありません。`
                : "まだページがありません。最初の 1 ページを登録してみてください。"
            }
          />
        </>
      ) : null}
      {view === "mine" ? <MineView entries={mine} /> : null}
      {view === "appraise" ? <AppraiseQueue entries={queue} /> : null}
    </div>
  );
}

function ChapterFilter({ current, counts, total }: { current: ZukanChapter | null; counts: Record<ZukanChapter, number>; total: number }) {
  const chip = (active: boolean) =>
    "border px-3 py-1 text-sm transition-colors " +
    (active ? "bg-brand01 border-brand01 font-bold text-white" : "border-brand01/20 text-brand01 hover:border-brand03 bg-white");
  return (
    <div className="flex flex-wrap gap-2" aria-label="章">
      <Link href={manifest.route} aria-current={current === null ? "true" : undefined} className={chip(current === null)}>
        すべて <span className="tabular-nums">{total}</span>
      </Link>
      {ZUKAN_CHAPTERS.map((c) => (
        <Link key={c} href={`${manifest.route}?ch=${c}`} aria-current={current === c ? "true" : undefined} className={chip(current === c)}>
          {CHAPTER_LABEL[c].label} <span className="tabular-nums">{counts[c]}</span>
        </Link>
      ))}
    </div>
  );
}

function MineView({ entries }: { entries: Awaited<ReturnType<typeof listMine>> }) {
  const published = entries.filter((e) => e.status === "published");
  const drafts = entries.filter((e) => e.status === "draft");
  const scoreTotal = published.reduce((s, e) => s + (e.score ?? 0), 0);
  const appraised = published.filter((e) => e.score !== null).length;
  const { reached, next } = milestoneOf(published.length);
  return (
    <section className="flex flex-col gap-6" aria-label="自分の図鑑">
      <dl className="border-brand01/15 grid grid-cols-2 gap-px border bg-[rgb(0_60_150/0.15)] sm:grid-cols-4">
        <Stat label="登録したページ" value={`${published.length}`} />
        <Stat label="発見待ち" value={`${drafts.length}`} />
        <Stat label="合計点" value={`${scoreTotal}`} note={`鑑定済み ${appraised} ページ`} />
        <Stat
          label="印"
          value={reached ? reached.label : "まだありません"}
          note={next ? `次は ${next.count} ページで「${next.label}」` : "すべての印が集まりました"}
          small
        />
      </dl>

      {drafts.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-brand01 text-base font-bold">発見待ち(アフター待ち)</h2>
          <p className="text-brand04 text-sm">ビフォーだけ保存したページです。改善が終わったら、押してアフターを足すと図鑑に載ります。</p>
          <EntryGrid entries={drafts} empty="" />
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-brand01 text-base font-bold">登録したページ</h2>
        <EntryGrid entries={published} empty="まだ登録したページはありません。「＋ 登録する」から、ビフォーとアフターの写真を撮って登録できます。" />
      </div>
    </section>
  );
}

function Stat({ label, value, note, small }: { label: string; value: string; note?: string; small?: boolean }) {
  return (
    <div className="flex flex-col gap-1 bg-white px-4 py-3">
      <dt className="text-brand04 text-xs">{label}</dt>
      <dd className={`text-brand01 font-bold tabular-nums ${small ? "text-base" : "font-heading text-3xl leading-none"}`}>{value}</dd>
      {note ? <dd className="text-brand04 text-xs">{note}</dd> : null}
    </div>
  );
}

function AppraiseQueue({ entries }: { entries: Awaited<ReturnType<typeof listAppraiseQueue>> }) {
  if (entries.length === 0) return <p className="bg-bg01 text-brand04 px-4 py-6 text-sm">鑑定待ちのページはありません。</p>;
  return (
    <section className="flex flex-col gap-3" aria-label="鑑定待ち">
      <p className="text-brand04 text-sm">
        古い順です。ページを開いて、AI の下見を見ながら点数を確定してください。AI の点数は、鑑定する人にだけ見えています。
      </p>
      <ul className="flex flex-col gap-3">
        {entries.map((e) => (
          <li key={e.id} className="border-brand01/15 grid gap-4 border bg-white p-3 sm:grid-cols-[12rem_1fr]">
            <EntryCard entry={e} />
            <div className="flex flex-col gap-2 text-sm">
              {e.aiReview ? (
                <>
                  <p className="text-brand01 font-bold">
                    AI の下見: <span className="font-heading text-lg tabular-nums">{scoreOf(e.aiReview.scores)}</span> 点
                  </p>
                  <ul className="text-brand04 grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {CRITERIA.map((c) => (
                      <li key={c}>
                        {CRITERION_LABEL[c].label} <span className="text-brand01 font-bold tabular-nums">{e.aiReview!.scores[c]}</span> / 5
                      </li>
                    ))}
                  </ul>
                  <p className="text-ink">{e.aiReview.summary}</p>
                </>
              ) : (
                <p className="text-brand04">AI の下見はまだありません(登録の直後か、AI が見られませんでした)。</p>
              )}
              <Link href={`${manifest.route}/${e.id}#appraise`} className="text-brand01 hover:text-brand03 mt-auto font-bold">
                鑑定する →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
