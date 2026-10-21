import { shortDate } from "../logic";
import type { Highlight } from "../highlights";

/** お知らせ 1 件の文。 */
export function highlightText(h: Highlight): string {
  switch (h.kind) {
    case "work_saturday_today":
      return "今日は出勤日(土曜)です。";
    case "work_saturday_next":
      return `${h.daysUntil === 1 ? "明日" : h.daysUntil === 2 ? "あさって" : ""} ${shortDate(h.date)} は出勤日です。`.trim();
    case "holiday_tomorrow": {
      const { name, start, end, days, truncated } = h.holiday;
      const range = truncated ? `${shortDate(start)}〜。翌年分は未登録` : `${shortDate(start)}〜${shortDate(end)}・${days}日間`;
      return `明日から${name}です(${range})。`;
    }
    case "anniversary":
      return `今日で入社${h.years}年です。いつもありがとうございます。`;
    case "birthday":
      return "お誕生日おめでとうございます。";
    case "birthdays":
      return `今日は ${h.names.map((n) => `${n}さん`).join("・")} の誕生日です。`;
    case "payday":
      return "今日は給料日です。";
  }
}

/** 強めに知らせるもの(出勤土曜)。 */
function isImportant(h: Highlight): boolean {
  return h.kind === "work_saturday_today" || h.kind === "work_saturday_next";
}

/** 今日のお知らせの一覧。0 件なら何も描画しない。 */
export function HighlightList({ items }: { items: Highlight[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((h) => (
        <li
          key={h.kind}
          className={`flex items-start gap-3 border border-l-4 px-4 py-3 ${
            isImportant(h) ? "border-brand03 bg-brand03/10" : "border-brand01/20 border-l-brand01 bg-bg01"
          }`}
        >
          <span
            className={`shrink-0 px-1.5 text-xs leading-5 font-bold text-white ${isImportant(h) ? "bg-brand03" : "bg-brand01"}`}
          >
            {h.kind === "anniversary"
              ? "周年"
              : h.kind === "birthday" || h.kind === "birthdays"
                ? "誕生日"
                : h.kind === "payday"
                  ? "給料日"
                  : isImportant(h)
                    ? "出勤日"
                    : "連休"}
          </span>
          <span className="text-brand01 font-bold">{highlightText(h)}</span>
        </li>
      ))}
    </ul>
  );
}
