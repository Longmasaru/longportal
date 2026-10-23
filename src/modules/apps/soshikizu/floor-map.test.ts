import assert from "node:assert/strict";
import { test } from "node:test";
import { FLOOR_AREAS, FLOOR_MAP_SIZE, FLOOR_SEATS, applySeatOverrides, areaAt, findSeatMember, placeSeats, seatLabelOf } from "./floor-map";

const people = [
  { employeeId: "a", familyName: "長井", givenName: "隆" },
  { employeeId: "b", familyName: "長井", givenName: "将" },
  { employeeId: "c", familyName: "平口", givenName: "裕二" },
  { employeeId: "d", familyName: "BUI THANH", givenName: "PHUONG" },
  { employeeId: "e", familyName: "川井", givenName: "和良" },
];

test("findSeatMember: 名字だけは 1 人に決まるときだけ、名前つき・フルネームはそのまま当てる", () => {
  assert.equal(findSeatMember({ family: "平口" }, people)?.employeeId, "c");
  assert.equal(findSeatMember({ family: "長井" }, people), null);
  assert.equal(findSeatMember({ family: "長井", given: "将" }, people)?.employeeId, "b");
  assert.equal(findSeatMember({ full: "BUI THANH PHUONG" }, people)?.employeeId, "d");
  assert.equal(findSeatMember({ full: "bui  thanh phuong" }, people)?.employeeId, "d");
  assert.equal(findSeatMember({ full: "BUI THANH PHOUNG" }, people), null);
  assert.equal(findSeatMember({ family: "田中" }, people), null);
});

test("placeSeats: 当たらない札は member が null、札のない人は unplaced", () => {
  const { seats, unplaced } = placeSeats(
    [
      { area: "office", at: { x: 1, y: 1 }, label: "平口", yomi: "ひらぐち", who: { family: "平口" } },
      { area: "office", at: { x: 2, y: 2 }, label: "平口", yomi: "ひらぐち", who: { family: "平口" } },
      { area: "kojo3", at: { x: 3, y: 3 }, label: "TAI", yomi: "タイ", who: { full: "DING BAT TAI" } },
    ],
    people,
  );
  assert.deepEqual(seats.map((s) => s.member?.employeeId ?? null), ["c", null, null]);
  assert.deepEqual(unplaced.map((m) => m.employeeId), ["a", "b", "d", "e"]);
});

test("配置図のデータ: 札は図の中、どこかの場所に属し、同じ人を 2 回書いていない", () => {
  const keys = new Set(FLOOR_AREAS.map((a) => a.key));
  const seen = new Set<string>();
  for (const s of FLOOR_SEATS) {
    assert.ok(keys.has(s.area), s.label);
    assert.ok(s.at.x > 0 && s.at.x < FLOOR_MAP_SIZE.width && s.at.y > 0 && s.at.y < FLOOR_MAP_SIZE.height, s.label);
    const id = JSON.stringify(s.who);
    assert.ok(!seen.has(id), `${s.label} が 2 回`);
    seen.add(id);
  }
});

test("areaAt: 部屋が建物より先、外は null", () => {
  assert.equal(areaAt({ x: 20, y: 90 }), "office");
  assert.equal(areaAt({ x: 20, y: 200 }), "kojo1");
  assert.equal(areaAt({ x: 150, y: 100 }), "kojo3");
  assert.equal(areaAt({ x: 60, y: 30 }), null);
});

test("applySeatOverrides: 札のある人は動かし、札のない人には札を足す", () => {
  const ms = [
    { employeeId: "c", familyName: "平口", givenName: "裕二", nameKana: "ひらぐち ゆうじ" },
    { employeeId: "v", familyName: "PHAM THI", givenName: "VAN", nameKana: "ファム・ティ・ヴァン" },
    { employeeId: "n", familyName: "新人", givenName: "太郎", nameKana: "しんじん たろう" },
  ];
  const placed = placeSeats([{ area: "office", at: { x: 1, y: 1 }, label: "平口", yomi: "ひらぐち", who: { family: "平口" } }], ms);
  const out = applySeatOverrides(placed, [
    { employeeId: "c", area: "kojo3", x: 150, y: 100 },
    { employeeId: "v", area: "soko", x: 160, y: 150 },
  ]);
  assert.deepEqual(
    out.seats.map((s) => [s.index, s.label, s.yomi, s.area, s.at.x, s.moved]),
    [
      [0, "平口", "ひらぐち", "kojo3", 150, true],
      [1, "VAN", "ヴァン", "soko", 160, true],
    ],
  );
  assert.deepEqual(out.unplaced.map((m) => m.employeeId), ["n"]);
  assert.deepEqual(seatLabelOf(ms[2]), { label: "新人", yomi: "しんじん" });
});
