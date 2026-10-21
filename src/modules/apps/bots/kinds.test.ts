import assert from "node:assert/strict";
import { test } from "node:test";
import { BOT_KIND_DEFS, composeNotice, composeRain, weekdayOf } from "./kinds";

const forecast = [
  {
    timeSeries: [
      {
        timeDefines: ["2026-10-21T05:00:00+09:00"],
        areas: [{ area: { name: "加賀", code: "170010" }, weathers: ["くもり　昼過ぎ　から　雨"] }],
      },
      {
        timeDefines: ["2026-10-21T06:00:00+09:00", "2026-10-21T12:00:00+09:00", "2026-10-21T18:00:00+09:00"],
        areas: [{ area: { name: "加賀", code: "170010" }, pops: ["20", "60", "70"] }],
      },
    ],
  },
];

test("曜日は JST の暦日で数える(2026-10-21 は水曜)", () => {
  assert.equal(weekdayOf("2026-10-21"), 3);
  assert.equal(weekdayOf("2026-10-25"), 0);
});

test("雨予報: しきい値以上なら、天気と降水確率を送る", () => {
  const r = composeRain({ area: "170010", threshold: 50, sendWhenDry: false }, forecast, "2026-10-21");
  assert.equal(r.send, true);
  if (!r.send) return;
  assert.match(r.text, /^☔ 今日 10\/21\(水\) の加賀は、雨の予報です\(降水確率 最大 70%\)。/);
  assert.match(r.text, /天気: くもり 昼過ぎ から 雨/);
  assert.match(r.text, /降水確率: 6時〜 20% \/ 12時〜 60% \/ 18時〜 70%/);
  assert.match(r.text, /出典: 気象庁/);
});

test("雨予報: しきい値より低い日は送らない。「雨が降らない日も送る」なら送る", () => {
  assert.equal(composeRain({ area: "170010", threshold: 80, sendWhenDry: false }, forecast, "2026-10-21").send, false);
  const dry = composeRain({ area: "170010", threshold: 80, sendWhenDry: true }, forecast, "2026-10-21");
  assert.equal(dry.send, true);
  if (dry.send) assert.match(dry.text, /^☀/);
});

test("雨予報: 今日の予報がなければ送らない", () => {
  assert.equal(composeRain({ area: "170010", threshold: 50, sendWhenDry: true }, forecast, "2026-10-22").send, false);
});

test("定時のお知らせ: 選んだ曜日だけ送る", () => {
  const s = { text: "朝礼は 8 時です", weekdays: [1, 2, 3, 4, 5] };
  assert.deepEqual(composeNotice(s, "2026-10-21"), { send: true, text: "朝礼は 8 時です" });
  assert.equal(composeNotice(s, "2026-10-25").send, false);
});

test("フォームの設定を種類ごとの形で確かめる", () => {
  const f = new FormData();
  f.set("s.area", "170010");
  f.set("s.threshold", "40");
  assert.deepEqual(BOT_KIND_DEFS.rain.schema.parse(BOT_KIND_DEFS.rain.fromForm(f)), {
    area: "170010",
    threshold: 40,
    sendWhenDry: false,
  });
  f.set("s.area", "130010");
  assert.equal(BOT_KIND_DEFS.rain.schema.safeParse(BOT_KIND_DEFS.rain.fromForm(f)).success, false);

  const n = new FormData();
  n.set("s.text", " 掃除の日です ");
  n.append("s.weekdays", "1");
  n.append("s.weekdays", "5");
  assert.deepEqual(BOT_KIND_DEFS.notice.schema.parse(BOT_KIND_DEFS.notice.fromForm(n)), {
    text: "掃除の日です",
    weekdays: [1, 5],
  });
  assert.equal(BOT_KIND_DEFS.notice.schema.safeParse(BOT_KIND_DEFS.notice.fromForm(new FormData())).success, false);
});

test("保存された設定が壊れていたら、画面で直せる言葉のエラーにする", async () => {
  const ctx = { today: "2026-10-21", fetchForecast: async () => [] };
  await assert.rejects(BOT_KIND_DEFS.notice.compose({ text: "x", weekdays: [] }, ctx), /^Error: Bot の設定を確かめてください\(送る曜日を 1 つ以上選んでください。\)。$/);
});
