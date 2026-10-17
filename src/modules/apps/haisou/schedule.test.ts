import assert from "node:assert/strict";
import { test } from "node:test";
import { HQ_LATLNG } from "./constants";
import {
  advanceClock,
  buildMapLinks,
  buildSchedule,
  formatClock,
  formatDateLabel,
  legsFrom,
  parseClock,
  parseDateLabel,
  parseLatLng,
  rescheduleTimes,
  type Stop,
} from "./schedule";

test("advanceClock: 休憩にかからなければ、そのまま進む", () => {
  assert.deepEqual(advanceClock(parseClock("09:00"), 30), { time: parseClock("09:30"), crossed: [] });
});

test("advanceClock: 昼休みをまたぐと、休憩の分だけ後ろにずれる", () => {
  const r = advanceClock(parseClock("11:50"), 20);
  assert.equal(formatClock(r.time), "12:55");
  assert.deepEqual(
    r.crossed.map((b) => b.label),
    ["昼休み 12:00〜12:45"],
  );
});

test("advanceClock: 休憩の中から始めると、休憩の終わりから数える", () => {
  assert.equal(formatClock(advanceClock(parseClock("15:05"), 5).time), "15:20");
});

test("advanceClock: 複数の休憩をまたぐ", () => {
  const r = advanceClock(parseClock("14:50"), 170);
  // 14:50 +10 → 15:00(休憩 15 分)→ 15:15 +135 → 17:30(休憩 10 分)→ 17:40 +25 → 18:05
  assert.equal(formatClock(r.time), "18:05");
  assert.equal(r.crossed.length, 2);
});

test("legsFrom: 経路が取れないときは、1 区間 15 分の概算", () => {
  assert.deepEqual(legsFrom(2, null, null), {
    legMins: [15, 15, 15],
    legKm: [null, null, null],
    totalMin: 45,
    totalKm: null,
  });
});

test("legsFrom: 秒は分に切り上げ、メートルは km(小数 1 桁)", () => {
  const r = legsFrom(1, [61, 600], [1234, 5000]);
  assert.deepEqual(r.legMins, [2, 10]);
  assert.deepEqual(r.legKm, [1.2, 5]);
  assert.equal(r.totalMin, 12);
  assert.equal(r.totalKm, 6.2);
});

test("buildSchedule: 到着・出発・帰着の時刻", () => {
  const stop: Stop = {
    row: 2,
    name: "テスト商事",
    person: "",
    address: "金沢市",
    tel: "",
    latlng: "36.5,136.6",
    yoken: "",
    detail: "",
    stay: 10,
  };
  const r = buildSchedule([stop], "08:30", [20, 20], [5, 5]);
  assert.equal(r.schedule[0].arrive, "08:50");
  assert.equal(r.schedule[0].depart, "09:00");
  assert.equal(r.schedule[0].yoken, "納品");
  assert.equal(r.backTime, "09:20");
});

test("buildSchedule: 待ち時間は到着のあとに足し、それ以降の時刻を後ろにずらす", () => {
  const base = { person: "", address: "", tel: "", latlng: "", yoken: "", detail: "" };
  const stops: Stop[] = [
    { ...base, row: 2, name: "A", stay: 10, wait: 30 },
    { ...base, row: 3, name: "B", stay: 10 },
  ];
  const r = buildSchedule(stops, "08:30", [20, 15, 20], [null, null, null]);
  assert.equal(r.schedule[0].arrive, "08:50");
  assert.equal(r.schedule[0].wait, 30);
  assert.equal(r.schedule[0].depart, "09:30");
  assert.equal(r.schedule[1].arrive, "09:45");
  assert.equal(r.schedule[1].wait, 0);
  assert.equal(r.backTime, "10:15");
});

test("rescheduleTimes: 移動時間はそのままで、待ちを入れた先の時刻と帰着を付け直す", () => {
  const base = { person: "", address: "", tel: "", latlng: "", yoken: "納品", detail: "" };
  const first = buildSchedule(
    [
      { ...base, row: 2, name: "A", stay: 10 },
      { ...base, row: 3, name: "B", stay: 10 },
    ],
    "10:30",
    [20, 15, 20],
    [3.1, 2, 4],
  );
  const result = { startTime: "10:30", lastLegMin: 20, lastLegKm: 4, backTime: first.backTime, schedule: first.schedule };
  assert.equal(result.backTime, "11:45");
  result.schedule[0].wait = 30;
  const r = rescheduleTimes(result);
  assert.equal(r.schedule[0].arrive, "10:50");
  assert.equal(r.schedule[0].depart, "11:30");
  assert.equal(r.schedule[1].arrive, "11:45");
  assert.equal(r.schedule[1].travelKm, 2);
  // 帰り道で昼休み(12:00〜12:45)にかかり、帰着は 13:00
  assert.equal(r.backTime, "13:00");
});

test("buildMapLinks: 10 件までは 1 本で、会社に戻る", () => {
  const locs = Array.from({ length: 5 }, (_, i) => `36.${i},136.${i}`);
  const links = buildMapLinks(locs, true);
  assert.equal(links.length, 1);
  assert.equal(links[0].label, "Googleマップでルートを開く");
  const url = new URL(links[0].url);
  assert.equal(url.searchParams.get("origin"), HQ_LATLNG);
  assert.equal(url.searchParams.get("destination"), HQ_LATLNG);
  assert.equal(url.searchParams.get("waypoints")?.split("|").length, 5);
  assert.equal(url.searchParams.get("avoid"), "highways");
});

test("buildMapLinks: 経由地が 9 件を超えると、分けてつなぐ", () => {
  const locs = Array.from({ length: 12 }, (_, i) => `36.${i},136.${i}`);
  const links = buildMapLinks(locs, false);
  assert.deepEqual(
    links.map((l) => l.label),
    ["ルート 1", "ルート 2"],
  );
  const a = new URL(links[0].url);
  const b = new URL(links[1].url);
  assert.equal(a.searchParams.get("waypoints")?.split("|").length, 9);
  assert.equal(a.searchParams.get("destination"), locs[9]);
  assert.equal(b.searchParams.get("origin"), locs[9]);
  assert.equal(b.searchParams.get("destination"), HQ_LATLNG);
  assert.equal(a.searchParams.get("avoid"), null);
});

test("日付の表示と読み取り", () => {
  assert.equal(formatDateLabel("2026-09-08"), "2026年9月8日(火)");
  assert.equal(parseDateLabel("2026年9月8日(火)"), "2026-09-08");
  assert.equal(parseDateLabel("2026/9/8"), "2026-09-08");
  assert.equal(parseDateLabel("きょう"), null);
});

test("parseLatLng", () => {
  assert.deepEqual(parseLatLng(" 36.6, 136.7 "), { latitude: 36.6, longitude: 136.7 });
  assert.equal(parseLatLng("金沢"), null);
});
