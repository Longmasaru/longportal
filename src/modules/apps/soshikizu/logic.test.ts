import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOrgBoxes, compareMembers, isOnRoster } from "./logic";
import type { OrgMember, OrgUnit } from "./types";

const DEPTS: OrgUnit[] = [
  { id: "d-gijutsu", code: "20", name: "技術部", sortOrder: 2 },
  { id: "d-soumu", code: "10", name: "総務部", sortOrder: 1 },
  { id: "d-empty", code: "30", name: "人のいない部", sortOrder: 3 },
];

function member(over: Partial<OrgMember> & { employeeId: string }): OrgMember {
  return {
    employeeNumber: over.employeeId,
    name: "山田 太郎",
    nameKana: null,
    positionName: null,
    isManagement: false,
    positionRank: null,
    positionSortOrder: null,
    hiredOn: "2020-04-01",
    departmentId: "d-soumu",
    locationId: "l-honsha",
    locationName: "本社工場",
    ...over,
  };
}

test("compareMembers: 序列が高い順、役職なしは最後、同じなら入社が早い順", () => {
  const list = [
    member({ employeeId: "0003" }),
    member({ employeeId: "0002", positionRank: 10, positionSortOrder: 2 }),
    member({ employeeId: "0001", positionRank: 50, positionSortOrder: 1 }),
    member({ employeeId: "0004", hiredOn: "2010-04-01" }),
  ].sort(compareMembers);
  assert.deepEqual(
    list.map((m) => m.employeeId),
    ["0001", "0002", "0004", "0003"],
  );
});

test("buildOrgBoxes: 部署は表示順、空の部署は出さず、所属なしは最後", () => {
  const boxes = buildOrgBoxes(
    [
      member({ employeeId: "a", departmentId: "d-gijutsu" }),
      member({ employeeId: "b", departmentId: "d-soumu", isManagement: true, positionRank: 50 }),
      member({ employeeId: "c", departmentId: "d-soumu" }),
      member({ employeeId: "d", departmentId: null, locationId: null, locationName: null }),
    ],
    DEPTS,
    null,
  );
  assert.deepEqual(
    boxes.map((b) => b.department?.name ?? "所属なし"),
    ["総務部", "技術部", "所属なし"],
  );
  assert.deepEqual(boxes[0].leaders.map((m) => m.employeeId), ["b"]);
  assert.deepEqual(boxes[0].members.map((m) => m.employeeId), ["c"]);
  assert.equal(boxes[0].count, 2);
});

test("buildOrgBoxes: 拠点で絞ると、その拠点の人だけ(所属なしの箱も出さない)", () => {
  const boxes = buildOrgBoxes(
    [
      member({ employeeId: "a", departmentId: "d-gijutsu", locationId: "l-2gouten" }),
      member({ employeeId: "b", departmentId: "d-soumu" }),
      member({ employeeId: "d", departmentId: null, locationId: null, locationName: null }),
    ],
    DEPTS,
    "l-2gouten",
  );
  assert.deepEqual(boxes.map((b) => b.department?.name), ["技術部"]);
});

test("buildOrgBoxes: 無効になった部署の人は所属なしに入る", () => {
  const boxes = buildOrgBoxes([member({ employeeId: "a", departmentId: "d-gone" })], DEPTS, null);
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].department, null);
});

test("isOnRoster: 在籍判定", () => {
  const today = "2026-10-21";
  assert.equal(isOnRoster({ status: "active", hiredOn: "2020-04-01", leftOn: null }, today), true);
  assert.equal(isOnRoster({ status: "leave", hiredOn: "2020-04-01", leftOn: null }, today), true);
  assert.equal(isOnRoster({ status: "active", hiredOn: "2020-04-01", leftOn: today }, today), true);
  assert.equal(isOnRoster({ status: "active", hiredOn: "2020-04-01", leftOn: "2026-10-20" }, today), false);
  assert.equal(isOnRoster({ status: "active", hiredOn: "2026-10-22", leftOn: null }, today), false);
  assert.equal(isOnRoster({ status: "planned", hiredOn: "2020-04-01", leftOn: null }, today), false);
  assert.equal(isOnRoster({ status: "retired", hiredOn: "2020-04-01", leftOn: "2026-01-01" }, today), false);
});
