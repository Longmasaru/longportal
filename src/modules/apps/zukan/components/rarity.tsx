import { CHAPTER_LABEL, RARITY_LABEL, formatNo, type Rarity, type ZukanChapter } from "../constants";

// 図鑑のページの見た目の部品(docs/DESIGN.md 44 章)。ロングのデザインシステムに合わせ、影・グラデーションは使わず、
// レア度は縁の色と太さだけで表す(本物の図鑑のように落ち着いた見た目にする)。

/** レア度ごとの縁の色(★1 は通常の罫線)。 */
export const RARITY_COLOR: Record<Rarity, string> = {
  1: "#c9d3e3",
  2: "#a8693a",
  3: "#8e9aa6",
  4: "#c49a2c",
  5: "#e67150",
};

/** ページ(カード)の縁。★5 は二重の縁。 */
export function rarityFrameStyle(rarity: Rarity | null): React.CSSProperties {
  if (!rarity) return { border: "1px dashed rgb(0 60 150 / 0.3)" };
  if (rarity === 5) {
    return { border: `3px double ${RARITY_COLOR[5]}`, outline: `1px solid ${RARITY_COLOR[4]}`, outlineOffset: "3px" };
  }
  return { border: `${rarity === 1 ? 1 : 2}px solid ${RARITY_COLOR[rarity]}` };
}

export function Stars({ rarity, size = "text-sm" }: { rarity: Rarity; size?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${size}`} aria-label={`レア度 ★${rarity}(${RARITY_LABEL[rarity]})`}>
      <span aria-hidden style={{ color: RARITY_COLOR[rarity === 1 ? 4 : rarity] }} className="tracking-tight">
        {"★".repeat(rarity)}
        <span className="text-brand01/15">{"★".repeat(5 - rarity)}</span>
      </span>
    </span>
  );
}

/** 鑑定中の印。 */
export function Appraising({ className = "" }: { className?: string }) {
  return (
    <span className={`border-brand04/40 text-brand04 inline-block border border-dashed px-1.5 text-xs leading-5 ${className}`}>
      鑑定中
    </span>
  );
}

export function ChapterTag({ chapter }: { chapter: ZukanChapter }) {
  return <span className="bg-bg01 text-brand01 inline-block px-1.5 text-xs leading-5 font-bold">{CHAPTER_LABEL[chapter].label}</span>;
}

export function EntryNo({ number, className = "" }: { number: number | null; className?: string }) {
  return (
    <span className={`font-heading text-brand01 tabular-nums tracking-wider ${className}`}>
      {number === null ? "No.???" : formatNo(number)}
    </span>
  );
}

export const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export const TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
