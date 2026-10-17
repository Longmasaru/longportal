import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bashoOf,
  bashoWeeks,
  computeNextBanzuke,
  findYusho,
  kanjiNumber,
  poolRanks,
  prevBasho,
  shikonaCandidates,
  type PrevEntry,
} from "./banzuke";

const entry = (userId: string, position: number, rank: PrevEntry["rank"], wins: number, extra: Partial<PrevEntry> = {}): PrevEntry => ({
  userId,
  position,
  rank,
  wins,
  received: 0,
  ozekiYushoBefore: false,
  ...extra,
});

describe("場所", () => {
  it("2 か月でひと場所、年六場所", () => {
    assert.deepEqual(bashoOf("2026-10-17"), {
      key: "2026-09",
      name: "秋場所",
      fullName: "令和八年秋場所",
      start: "2026-09-01",
      end: "2026-10-31",
    });
    assert.equal(bashoOf("2026-11-01").name, "九州場所");
    assert.equal(bashoOf("2026-12-31").end, "2026-12-31");
    assert.equal(bashoOf("2028-02-29").end, "2028-02-29");
    assert.equal(bashoOf("2028-01-15").name, "初場所");
  });

  it("前の場所(年をまたぐ)", () => {
    assert.equal(prevBasho("2027-01").key, "2026-11");
    assert.equal(prevBasho("2026-11").key, "2026-09");
  });

  it("場所の週は月曜はじまりで、場所の外の日を含めない", () => {
    const weeks = bashoWeeks(bashoOf("2026-11-10")); // 2026-11-01(日)〜12-31(木)
    assert.deepEqual(weeks[0], { start: "2026-11-01", end: "2026-11-01" });
    assert.deepEqual(weeks[1], { start: "2026-11-02", end: "2026-11-08" });
    assert.deepEqual(weeks.at(-1), { start: "2026-12-28", end: "2026-12-31" });
    assert.equal(weeks.length, 10);
  });

  it("漢数字", () => {
    assert.equal(kanjiNumber(8), "八");
    assert.equal(kanjiNumber(10), "十");
    assert.equal(kanjiNumber(15), "十五");
    assert.equal(kanjiNumber(54), "五十四");
  });
});

describe("四股名の候補", () => {
  it("姓から作る", () => {
    assert.deepEqual(shikonaCandidates("佐藤"), ["佐藤乃海", "佐藤錦", "佐藤富士", "佐藤山", "佐藤龍", "若佐藤"]);
    assert.deepEqual(shikonaCandidates(" "), []);
  });
});

describe("番付の編成", () => {
  it("位の枠", () => {
    assert.deepEqual(poolRanks(3), ["sekiwake", "sekiwake", "komusubi"]);
    const r = poolRanks(54);
    assert.equal(r.length, 54);
    assert.equal(r.filter((x) => x === "maegashira").length, 15);
    assert.equal(r.at(-1), "jonokuchi");
  });

  it("最初の場所は全員が前相撲、東西は交互", () => {
    const next = computeNextBanzuke([], ["a", "b", "c"], new Set(["a", "b", "c"]));
    assert.deepEqual(
      next.map((e) => [e.userId, e.rank, e.side, e.position]),
      [
        ["a", "maezumo", "east", 1],
        ["b", "maezumo", "west", 2],
        ["c", "maezumo", "east", 3],
      ],
    );
  });

  it("前相撲から: 白星の多い順に並び、いちばん多い人は優勝して大関", () => {
    const prev = [entry("a", 1, "maezumo", 2), entry("b", 2, "maezumo", 9), entry("c", 3, "maezumo", 0), entry("d", 4, "maezumo", 5)];
    const next = computeNextBanzuke(prev, [], new Set(["a", "b", "c", "d"]));
    assert.deepEqual(
      next.map((e) => [e.userId, e.rank, e.promoted]),
      [
        ["b", "ozeki", true],
        ["d", "sekiwake", false],
        ["a", "sekiwake", false],
        ["c", "komusubi", false],
      ],
    );
  });

  it("白星 8 つ以上で上がり、7 つ以下で下がる", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const prev = [
      entry("a", 1, "sekiwake", 7),
      entry("b", 2, "sekiwake", 7),
      entry("c", 3, "komusubi", 7),
      entry("d", 4, "komusubi", 7),
      entry("e", 5, "maegashira", 8),
      entry("f", 6, "maegashira", 3),
    ];
    // 優勝は e(8)。e は大関へ。
    const next = computeNextBanzuke(prev, [], new Set(ids));
    assert.equal(next[0].userId, "e");
    assert.equal(next[0].rank, "ozeki");
    // 7 つの a〜d は 1 枚ずつ下がり、並びは変わらない。3 つの f は最下位のまま。
    assert.deepEqual(
      next.slice(1).map((e) => e.userId),
      ["a", "b", "c", "d", "f"],
    );
  });

  it("15 なら一気に上がる", () => {
    const prev = Array.from({ length: 20 }, (_, i) => entry(`u${i + 1}`, i + 1, i < 4 ? "sekiwake" : "maegashira", 8));
    prev[19] = entry("u20", 20, "maegashira", 16); // 優勝
    prev[18] = entry("u19", 19, "maegashira", 15);
    const next = computeNextBanzuke(prev, [], new Set(prev.map((e) => e.userId)));
    const pos = (id: string) => next.findIndex((e) => e.userId === id);
    assert.equal(next[0].userId, "u20"); // 優勝して大関
    assert.ok(pos("u19") < 8, `u19 は ${pos("u19")} 番目`);
  });

  it("大関で 2 場所続けて優勝すると横綱。横綱は下がらない", () => {
    const prev = [
      entry("y", 1, "yokozuna", 0),
      entry("o", 2, "ozeki", 12, { ozekiYushoBefore: true }),
      entry("s", 3, "sekiwake", 10),
    ];
    const next = computeNextBanzuke(prev, [], new Set(["y", "o", "s"]));
    assert.deepEqual(
      next.map((e) => [e.userId, e.rank, e.side, e.promoted]),
      [
        ["y", "yokozuna", "east", false],
        ["o", "yokozuna", "west", true],
        ["s", "sekiwake", "east", false],
      ],
    );
  });

  it("大関は 7 以下で関脇のいちばん上へ。8 以上なら残る", () => {
    const prev = [entry("o1", 1, "ozeki", 7), entry("o2", 2, "ozeki", 8), entry("s", 3, "sekiwake", 9)];
    const next = computeNextBanzuke(prev, [], new Set(["o1", "o2", "s"]));
    assert.deepEqual(
      next.map((e) => [e.userId, e.rank]),
      [
        ["o2", "ozeki"],
        ["s", "ozeki"],
        ["o1", "sekiwake"],
      ],
    );
  });

  it("退職した人は外し、新しく入った人は前相撲でいちばん下", () => {
    const prev = [entry("a", 1, "sekiwake", 3), entry("gone", 2, "sekiwake", 9)];
    const next = computeNextBanzuke(prev, ["new"], new Set(["a", "new"]));
    assert.deepEqual(
      next.map((e) => [e.userId, e.rank]),
      [
        ["a", "sekiwake"],
        ["new", "maezumo"],
      ],
    );
  });

  it("優勝: 白星が並んだら懸賞、さらに並んだら前の位置が上の人。0 なら優勝なし", () => {
    assert.equal(
      findYusho([
        { userId: "a", position: 1, wins: 5, received: 1 },
        { userId: "b", position: 2, wins: 5, received: 3 },
      ]),
      "b",
    );
    assert.equal(
      findYusho([
        { userId: "a", position: 2, wins: 5, received: 3 },
        { userId: "b", position: 1, wins: 5, received: 3 },
      ]),
      "b",
    );
    assert.equal(findYusho([{ userId: "a", position: 1, wins: 0, received: 9 }]), null);
  });
});
