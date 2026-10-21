// 画面の表示用の小さな関数(サーバー・クライアントの両方で使う)。

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** `YYYY-MM-DD` → `10.24(金)`(曜日は暦日から求める。時差の影響を受けない)。 */
export function formatDue(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${date.slice(5, 7)}.${date.slice(8, 10)}(${WEEKDAYS[weekday]})`;
}

export type DueTone = "overdue" | "today" | "soon" | "normal";
export const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: "text-brand03 font-bold",
  today: "text-brand01 font-bold",
  soon: "text-brand04",
  normal: "text-brand04",
};

/** 暦日どうしの差(日)。`YYYY-MM-DD` を UTC の日付として比べる(時差の影響を受けない)。 */
function diffDays(from: string, to: string): number {
  const ms = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** 期限を「3日超過」「今日」のような表記と、強調の度合いにする(今日は JST)。 */
export function describeDueDate(dueDate: string, today: string): { label: string; tone: DueTone } {
  const d = diffDays(today, dueDate);
  if (d < 0) return { label: `${-d}日超過`, tone: "overdue" };
  if (d === 0) return { label: "今日", tone: "today" };
  if (d === 1) return { label: "明日", tone: "soon" };
  if (d <= 7) return { label: `あと${d}日`, tone: "soon" };
  return { label: dueDate.replaceAll("-", "."), tone: "normal" };
}
