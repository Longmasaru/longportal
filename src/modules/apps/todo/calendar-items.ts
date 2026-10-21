import { personLabel } from "./requests";

// 本人の会社カレンダーに出す「TODO の期限」(docs/DESIGN.md 39.4)。DB に依存しない純粋関数。
// apps/calendar は参照しない。ここで作るのはただのデータで、src/app がカレンダーの extraDayItems に渡す。

export type TodoCalendarItem = {
  id: string;
  /** 期限(`YYYY-MM-DD`) */
  date: string;
  title: string;
  /** 印(「TODO」または「○○さんから」) */
  tag: string;
  href: string;
};

export type DueSource = {
  id: string;
  text: string;
  dueDate: string | null;
  done: boolean;
  /** 依頼か */
  isRequest: boolean;
  /** お返し済みか */
  returned: boolean;
  /** 頼んだ人の氏名(依頼のとき) */
  requesterName: string | null;
};

/** 未完了で期限のあるもの(お返しした依頼は除く)を、期限の順に。 */
export function dueDayItems(rows: DueSource[], href: string): TodoCalendarItem[] {
  return rows
    .filter((r) => r.dueDate && !r.done && !r.returned)
    .map((r) => ({
      id: r.id,
      date: r.dueDate!,
      title: r.text,
      tag: r.isRequest ? `${personLabel(r.requesterName)}から` : "TODO",
      href,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "ja"));
}
