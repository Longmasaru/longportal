import assert from "node:assert/strict";
import { test } from "node:test";
import { FLOOR_AREAS, FLOOR_MAP_SIZE, FLOOR_SEATS, findSeatMember, placeSeats } from "./floor-map";

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
