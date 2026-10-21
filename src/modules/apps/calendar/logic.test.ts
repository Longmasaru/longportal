import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays } from "@/modules/core/shared/date";
import {
  addMonths,
  dayInfo,
  monthGrid,
  nextOffDay,
  parseMonth,
  remainingWorkdays,
  weekDates,
  yearSummary,
} from "./logic";

// 紙のカレンダー(2026 年版)で赤字になっている日。月ごとに、写したまま並べる。
const PAPER_2026_OFF: Record<number, number[]> = {
  1: [1, 2, 3, 4, 10, 11, 12, 18, 24, 25, 31],
  2: [1, 7, 8, 11, 15, 21, 22, 23, 28],
  3: [1, 7, 8, 14, 15, 20, 21, 22, 28, 29],
  4: [4, 5, 11, 12, 18, 19, 25, 26, 29],
  5: [2, 3, 4, 5, 6, 10, 16, 17, 23, 24, 30, 31],
  6: [6, 7, 13, 14, 20, 21, 27, 28],
  7: [4, 5, 11, 12, 18, 19, 20, 25, 26],
  8: [1, 2, 8, 9, 13, 14, 15, 16, 22, 23, 29, 30],
  9: [5, 6, 12, 13, 19, 20, 21, 22, 23, 27],
  10: [3, 4, 10, 11, 12, 18, 24, 25, 31],
  11: [1, 3, 7, 8, 14, 15, 21, 22, 23, 28, 29],
  12: [5, 6, 12, 13, 19, 20, 26, 27, 30, 31],
};

test("2026 年の休みが紙のカレンダーと一致する", () => {
  for (let d = "2026-01-01"; d.startsWith("2026"); d = addDays(d, 1)) {
    const month = Number(d.slice(5, 7));
    const day = Number(d.slice(8, 10));
    const expected = PAPER_2026_OFF[month].includes(day) ? "off" : "work";
    assert.equal(dayInfo(d).kind, expected, d);
  }
});

test("出勤する土曜と、出勤になる祝日", () => {
  const sat = dayInfo("2026-10-17");
  assert.equal(sat.kind, "work");
  assert.equal(sat.isWorkSaturday, true);
  assert.equal(dayInfo("2026-08-11").kind, "work");
  assert.equal(dayInfo("2026-08-11").label, "山の日(出勤日)");
  assert.deepEqual(yearSummary(2026)?.workSaturdays, [
    "2026-01-17",
    "2026-02-14",
    "2026-05-09",
    "2026-09-26",
    "2026-10-17",
  ]);
});

test("未登録の年は unknown", () => {
  assert.equal(dayInfo("2027-01-05").kind, "unknown");
  assert.equal(yearSummary(2027), null);
});

test("次の休み・残りの出勤日数", () => {
  assert.equal(nextOffDay("2026-10-15")?.date, "2026-10-18");
  assert.equal(nextOffDay("2026-12-29")?.date, "2026-12-30");
  assert.equal(nextOffDay("2026-12-31"), null);
  // 10/15〜10/31 の出勤日: 15,16,17(土),19-23,26-30
  assert.equal(remainingWorkdays("2026-10-15"), 13);
  assert.equal(remainingWorkdays("2027-01-10"), null);
});

test("月の表と月の計算", () => {
  const weeks = monthGrid("2026-08");
  assert.equal(weeks.length, 6);
  assert.equal(weeks[0][6]?.date, "2026-08-01");
  assert.equal(weeks[0][0], null);
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(parseMonth("2026-10"), "2026-10");
  assert.equal(parseMonth("2026-13"), null);
  assert.equal(parseMonth(undefined), null);
});

test("weekDates: 今日を含む月曜〜日曜", () => {
  // 2026-10-21 は水曜
  assert.deepEqual(weekDates("2026-10-21"), [
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
    "2026-10-24",
    "2026-10-25",
  ]);
  // 日曜は、その週の最後の日
  assert.equal(weekDates("2026-10-25")[0], "2026-10-19");
  // 月曜は、その週の最初の日。月・年をまたぐ週
  assert.equal(weekDates("2026-12-28")[0], "2026-12-28");
  assert.equal(weekDates("2027-01-01")[0], "2026-12-28");
});
