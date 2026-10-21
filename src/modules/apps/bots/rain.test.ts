import assert from "node:assert/strict";
import { test } from "node:test";
import { rainReport } from "./rain";

// 気象庁の予報の JSON の形(必要なところだけ)。
const sample = [
  {
    reportDatetime: "2026-10-21T05:00:00+09:00",
    timeSeries: [
      {
        timeDefines: ["2026-10-21T05:00:00+09:00", "2026-10-22T00:00:00+09:00", "2026-10-23T00:00:00+09:00"],
        areas: [
          { area: { name: "加賀", code: "170010" }, weathers: ["くもり　昼過ぎ　から　雨", "雨　時々　くもり", "晴れ"] },
          { area: { name: "能登", code: "170020" }, weathers: ["くもり", "くもり", "晴れ"] },
        ],
      },
      {
        timeDefines: [
          "2026-10-21T06:00:00+09:00",
          "2026-10-21T12:00:00+09:00",
          "2026-10-21T18:00:00+09:00",
          "2026-10-22T00:00:00+09:00",
        ],
        areas: [
          { area: { name: "加賀", code: "170010" }, pops: ["20", "60", "70", "80"] },
          { area: { name: "能登", code: "170020" }, pops: ["10", "20", "", "30"] },
        ],
      },
    ],
  },
  { timeSeries: [] },
];

test("選んだ地域の、今日の 6 時間ごとの降水確率と天気を読む(明日の分は入れない)", () => {
  assert.deepEqual(rainReport(sample, "170010", "2026-10-21"), {
    areaName: "加賀",
    weather: "くもり 昼過ぎ から 雨",
    slots: [
      { hour: 6, pop: 20 },
      { hour: 12, pop: 60 },
      { hour: 18, pop: 70 },
    ],
    maxPop: 70,
  });
});

test("空の降水確率は飛ばす", () => {
  assert.deepEqual(rainReport(sample, "170020", "2026-10-21")?.slots, [
    { hour: 6, pop: 10 },
    { hour: 12, pop: 20 },
  ]);
});

test("今日の分がない・地域がない・形が違うときは null", () => {
  assert.equal(rainReport(sample, "170010", "2026-10-25"), null);
  assert.equal(rainReport(sample, "999999", "2026-10-21"), null);
  assert.equal(rainReport({ foo: 1 }, "170010", "2026-10-21"), null);
});
