import { StatusTag } from "@/modules/core/shared/ui/form";
import { formatDateDot } from "@/modules/core/shared/format";

// 日報の画面で共通の小さな部品(サーバー・クライアントの両方から使える)。

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** `YYYY-MM-DD` を「2026.10.20(火)」にする。 */
export function dateWithWeekday(isoDate: string): string {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return `${formatDateDot(isoDate)}(${WEEKDAYS[day]})`;
}

export const DATE_TIME = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** 一覧に出す、研修内容の最初の 1 行(箇条書きの記号は除く)。 */
export function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return line.replace(/^[\s・\-*●]+/, "").trim();
}

/** 指導者のコメントの状態。 */
export function CommentState({ status, reviewerComments }: { status: string; reviewerComments: number }) {
  if (status !== "submitted") return <StatusTag tone="muted">下書き</StatusTag>;
  if (reviewerComments === 0) return <StatusTag tone="attention">コメント待ち</StatusTag>;
  return <StatusTag tone="info">コメント {reviewerComments}件</StatusTag>;
}

export function Score({ score }: { score: number | null }) {
  if (score == null) return <span className="text-brand04">—</span>;
  return (
    <span className="text-brand01 font-heading font-bold tabular-nums">
      {score}
      <span className="text-brand04 text-xs font-normal">/10</span>
    </span>
  );
}
