import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, diffDays } from "@/modules/core/shared/date";
import { dailyNote } from "./daily-notes";
import {
  anniversaryDate,
  birthdaysOn,
  anniversaryYears,
  nextLongHoliday,
  nextWorkday,
  paydayOf,
  todaysHighlights,
} from "./highlights";

const kinds = (today: string, options?: Parameters<typeof todaysHighlights>[1]) =>
  todaysHighlights(today, options).map((h) => h.kind);

test("出勤土曜: 前の日(金曜)に「明日」、当日に「今日」", () => {
  assert.deepEqual(todaysHighlights("2026-10-16"), [{ kind: "work_saturday_next", date: "2026-10-17", daysUntil: 1 }]);
  assert.deepEqual(todaysHighlights("2026-10-17"), [{ kind: "work_saturday_today", date: "2026-10-17" }]);
  // 木曜はまだ出さない(次の出勤日は金曜)
  assert.deepEqual(kinds("2026-10-15"), []);
  assert.equal(nextWorkday("2026-10-16"), "2026-10-17");
});

test("次の連休: 2026-10-17 の時点では 11/21〜23 の 3 連休(あと 35 日)", () => {
  const h = nextLongHoliday("2026-10-17");
  assert.deepEqual(h, { start: "2026-11-21", end: "2026-11-23", days: 3, name: "3連休", truncated: false });
  assert.equal(diffDays("2026-10-17", h!.start), 35);
});

test("次の連休: 今日が連休の中なら、その連休を返す", () => {
  assert.deepEqual(nextLongHoliday("2026-10-11"), {
    start: "2026-10-10",
    end: "2026-10-12",
    days: 3,
    name: "3連休",
    truncated: false,
  });
});

test("次の連休: ゴールデンウィーク・夏季休暇の名前", () => {
  const gw = nextLongHoliday("2026-04-30");
  assert.equal(gw?.start, "2026-05-02");
  assert.equal(gw?.end, "2026-05-06");
  assert.equal(gw?.name, "ゴールデンウィーク");
  const summer = nextLongHoliday("2026-08-01");
  assert.deepEqual(summer, { start: "2026-08-13", end: "2026-08-16", days: 4, name: "夏季休暇", truncated: false });
});

test("次の連休: 年末は翌年分が未登録なので、途切れた形で出す", () => {
  assert.deepEqual(nextLongHoliday("2026-12-01"), {
    start: "2026-12-30",
    end: "2026-12-31",
    days: 2,
    name: "年末年始休暇",
    truncated: true,
  });
  // 年末年始休暇が過ぎたら(翌年は未登録)見つからない
  assert.equal(nextLongHoliday("2027-01-01"), null);
});

test("明日から連休: 前の出勤日だけに出す(ふつうの土日には出さない)", () => {
  const h = todaysHighlights("2026-11-20");
  assert.equal(h.length, 1);
  assert.equal(h[0].kind, "holiday_tomorrow");
  assert.deepEqual(kinds("2026-10-23"), []);
  assert.deepEqual(kinds("2026-11-21"), []);
  assert.deepEqual(kinds("2026-12-29", { payday: null }), ["holiday_tomorrow"]);
  // 12/29 は給料日(29 日)でもある
  assert.deepEqual(kinds("2026-12-29"), ["holiday_tomorrow", "payday"]);
});

test("入社の周年: 同じ月日に年数、2/29 入社は平年 2/28", () => {
  assert.equal(anniversaryYears("2016-10-17", "2026-10-17"), 10);
  assert.equal(anniversaryYears("2026-10-17", "2026-10-17"), null);
  assert.equal(anniversaryYears("2016-10-17", "2026-10-18"), null);
  assert.equal(anniversaryDate("2020-02-29", 2026), "2026-02-28");
  assert.equal(anniversaryDate("2020-02-29", 2028), "2028-02-29");
  assert.equal(anniversaryYears("2020-02-29", "2026-02-28"), 6);
  assert.deepEqual(todaysHighlights("2026-10-19", { hiredOn: "2025-10-19" }), [{ kind: "anniversary", years: 1 }]);
  assert.deepEqual(kinds("2026-10-19", { hiredOn: null }), []);
});

test("給料日: 未設定なら出さない。休みなら前の出勤日、月にない日は月末", () => {
  assert.equal(paydayOf("2026-10", null), null);
  assert.equal(paydayOf("2026-10", 25), "2026-10-23");
  assert.equal(paydayOf("2026-10", 20), "2026-10-20");
  assert.equal(paydayOf("2026-02", 31), "2026-02-27");
  assert.deepEqual(kinds("2026-10-23", { payday: 25 }), ["payday"]);
  assert.deepEqual(kinds("2026-10-23", { payday: null }), []);
});

test("給料日は毎月 29 日(土日・休日なら前の出勤日)", () => {
  assert.equal(paydayOf("2026-10"), "2026-10-29");
  assert.equal(paydayOf("2026-11"), "2026-11-27");
  assert.equal(paydayOf("2026-08"), "2026-08-28");
  assert.equal(paydayOf("2026-02"), "2026-02-27");
  assert.deepEqual(kinds("2026-10-29"), ["payday"]);
});

test("今日のひとこと: 決まった日の行事と、どの日にも何か出ること", () => {
  assert.match(dailyNote("2026-11-01"), /雪吊り/);
  assert.match(dailyNote("2026-11-06"), /ズワイガニ/);
  for (let d = "2026-01-01"; d.startsWith("2026"); d = addDays(d, 1)) {
    assert.ok(dailyNote(d).length > 0, d);
  }
});

test("誕生日: 本人は「お誕生日おめでとう」、ほかの人は名前で(2/29 生まれは平年 2/28)", () => {
  const others = [
    { employeeId: "a", name: "山田 太郎", birthDate: "1990-10-21" },
    { employeeId: "b", name: "佐藤 花子", birthDate: "1985-10-21" },
    { employeeId: "c", name: "鈴木 一郎", birthDate: "2000-02-29" },
  ];
  assert.deepEqual(birthdaysOn(others, "2026-10-21").map((p) => p.employeeId), ["a", "b"]);
  assert.deepEqual(birthdaysOn(others, "2026-02-28").map((p) => p.employeeId), ["c"]);
  assert.deepEqual(birthdaysOn(others, "2028-02-29").map((p) => p.employeeId), ["c"]);
  assert.deepEqual(birthdaysOn(others, "2028-02-28"), []);

  assert.deepEqual(todaysHighlights("2026-10-21", { birthDate: "1980-10-21", others }), [
    { kind: "birthday" },
    { kind: "birthdays", names: ["山田 太郎", "佐藤 花子"] },
  ]);
  // 権限のない人(others を渡さない)には、ほかの人の誕生日は出ない
  assert.deepEqual(todaysHighlights("2026-10-21", { birthDate: "1980-01-01" }), []);
});
