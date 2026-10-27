import Link from "next/link";
import { manifest } from "../manifest";
import type { EntrySummary } from "../queries";
import { Appraising, ChapterTag, EntryNo, Stars, rarityFrameStyle } from "./rarity";

// 図鑑の一覧の 1 枚(docs/DESIGN.md 44 章)。写真は左にビフォー、右にアフター。

function Half({ photoId, label }: { photoId: string | null; label: "BEFORE" | "AFTER" }) {
  return (
    <div className="bg-field relative aspect-[3/4] overflow-hidden">
      {photoId ? (
        // eslint-disable-next-line @next/next/no-img-element -- 見られる人だけ R2 へ転送する入口の画像
        <img src={`${manifest.route}/photos/${photoId}`} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="text-brand04 absolute inset-0 grid place-items-center text-xs">{label === "AFTER" ? "アフター待ち" : ""}</span>
      )}
      <span
        className={
          "font-heading absolute bottom-0 left-0 px-1.5 text-[10px] leading-4 font-bold tracking-widest " +
          (label === "BEFORE" ? "bg-white/90 text-brand04" : "bg-brand01 text-white")
        }
      >
        {label}
      </span>
    </div>
  );
}

export function EntryCard({ entry }: { entry: EntrySummary }) {
  const draft = entry.status === "draft";
  return (
    <Link
      href={draft ? `${manifest.route}/new?draft=${entry.id}` : `${manifest.route}/${entry.id}`}
      className="group hover:border-brand03 flex w-full flex-col bg-white transition-colors"
      style={rarityFrameStyle(draft ? null : entry.rarity)}
    >
      <div className="flex items-baseline justify-between gap-2 px-2.5 pt-2">
        <EntryNo number={entry.number} className="text-sm font-bold" />
        {draft ? (
          <span className="text-brand03 text-xs font-bold">発見待ち</span>
        ) : entry.rarity ? (
          <Stars rarity={entry.rarity} size="text-xs" />
        ) : (
          <Appraising />
        )}
      </div>
      <div className="mx-2.5 mt-1.5 grid grid-cols-2 gap-px">
        <Half photoId={entry.beforePhotoId} label="BEFORE" />
        <Half photoId={entry.afterPhotoId} label="AFTER" />
      </div>
      <div className="flex flex-1 flex-col gap-1 px-2.5 pt-2 pb-2.5">
        <p className="text-brand01 group-hover:text-brand03 line-clamp-2 text-sm leading-snug font-bold">
          {entry.title || "(名前はまだありません)"}
        </p>
        <p className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {entry.chapter ? <ChapterTag chapter={entry.chapter} /> : null}
          <span className="text-brand04 truncate">{entry.authorName}</span>
          {entry.unseenReveal ? <span className="bg-brand03 px-1 leading-5 font-bold text-white">結果が出ました</span> : null}
        </p>
      </div>
    </Link>
  );
}

export function EntryGrid({ entries, empty }: { entries: EntrySummary[]; empty: string }) {
  if (entries.length === 0) return <p className="bg-bg01 text-brand04 px-4 py-6 text-sm">{empty}</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {entries.map((e) => (
        <li key={e.id} className="flex">
          <EntryCard entry={e} />
        </li>
      ))}
    </ul>
  );
}
