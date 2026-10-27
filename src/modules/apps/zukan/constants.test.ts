import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatNo, milestoneOf, missingFields, rarityOf, scoreOf, unseenReveal } from "./constants";

describe("カイゼン図鑑の点数とレア度", () => {
  it("4 つの観点(各 1〜5)の合計を 100 点に直す", () => {
    assert.equal(scoreOf({ effect: 5, idea: 5, reuse: 5, sustain: 5 }), 100);
    assert.equal(scoreOf({ effect: 1, idea: 1, reuse: 1, sustain: 1 }), 20);
    assert.equal(scoreOf({ effect: 3, idea: 4, reuse: 3, sustain: 3 }), 65);
  });

  it("点数の区切りでレア度が決まる", () => {
    assert.equal(rarityOf(null), null);
    assert.equal(rarityOf(20), 1);
    assert.equal(rarityOf(39), 1);
    assert.equal(rarityOf(40), 2);
    assert.equal(rarityOf(59), 2);
    assert.equal(rarityOf(60), 3);
    assert.equal(rarityOf(75), 4);
    assert.equal(rarityOf(89), 4);
    assert.equal(rarityOf(90), 5);
    assert.equal(rarityOf(100), 5);
  });
});

describe("カイゼン図鑑の番号と節目", () => {
  it("番号は 3 桁でそろえ、1000 からはそのまま", () => {
    assert.equal(formatNo(1), "No.001");
    assert.equal(formatNo(50), "No.050");
    assert.equal(formatNo(1234), "No.1234");
  });

  it("自分の図鑑の印は、届いた中でいちばん大きいものと次の節目", () => {
    assert.deepEqual(milestoneOf(0), { reached: null, next: { count: 1, label: "はじめの 1 ページ" } });
    assert.equal(milestoneOf(1).reached?.count, 1);
    assert.equal(milestoneOf(1).next?.count, 10);
    assert.equal(milestoneOf(12).reached?.count, 10);
    assert.equal(milestoneOf(50).reached?.count, 50);
    assert.equal(milestoneOf(50).next, null);
  });
});

describe("カイゼン図鑑の入力チェック", () => {
  it("発見待ちの保存はビフォーの写真だけでよい", () => {
    assert.deepEqual(missingFields({ mode: "draft", beforeCount: 1, afterCount: 0, title: "", chapter: null }), []);
    assert.deepEqual(missingFields({ mode: "draft", beforeCount: 0, afterCount: 0, title: "", chapter: null }), ["before"]);
  });

  it("登録にはアフター・名前・章が要る", () => {
    assert.deepEqual(missingFields({ mode: "publish", beforeCount: 1, afterCount: 0, title: " ", chapter: "nope" }), [
      "after",
      "title",
      "chapter",
    ]);
    assert.deepEqual(missingFields({ mode: "publish", beforeCount: 1, afterCount: 1, title: "工具の定位置", chapter: "katazuke" }), []);
  });
});

describe("鑑定の結果の演出", () => {
  const t1 = new Date("2026-10-27T01:00:00Z");
  const t2 = new Date("2026-10-27T02:00:00Z");
  it("鑑定がなければ出さない", () => {
    assert.equal(unseenReveal({ appraisedAt: null, revealSeenAt: null }), false);
  });
  it("鑑定のあとにまだ見ていなければ出す。直されたら、もう一度出す", () => {
    assert.equal(unseenReveal({ appraisedAt: t1, revealSeenAt: null }), true);
    assert.equal(unseenReveal({ appraisedAt: t1, revealSeenAt: t2 }), false);
    assert.equal(unseenReveal({ appraisedAt: t2, revealSeenAt: t1 }), true);
  });
});
