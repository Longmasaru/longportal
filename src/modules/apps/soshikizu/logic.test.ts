import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOrgBoxes, buildOrgChart, compareMembers, isExecutive, isOnRoster, lineWorksTalkUrl } from "./logic";
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
    familyName: "山田",
    givenName: "太郎",
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

test("buildOrgChart: 社長・専務・常務・工場長は上に分け、箱に入れない。空になった部署の箱は出さない", () => {
  const { executives, boxes } = buildOrgChart(
    [
      member({ employeeId: "pres", positionName: "代表取締役社長", positionRank: 100, departmentId: "d-soumu" }),
      member({ employeeId: "jomu", positionName: "常務", positionRank: 80, departmentId: "d-soumu" }),
      member({ employeeId: "kojo", positionName: "工場長", positionRank: 70, departmentId: "d-gijutsu", locationId: "l-b" }),
      member({ employeeId: "a", positionName: "主任", positionRank: 40, departmentId: "d-gijutsu" }),
    ],
    DEPTS,
    null,
  );
  assert.deepEqual(executives.map((m) => m.employeeId), ["pres", "jomu", "kojo"]);
  assert.deepEqual(boxes.map((b) => [b.department?.name, b.count]), [["技術部", 1]]);
  // 拠点で絞ると、経営もその拠点の人だけ
  assert.deepEqual(buildOrgChart([member({ employeeId: "kojo", positionName: "工場長", locationId: "l-b" })], DEPTS, "l-honsha").executives, []);
  assert.equal(isExecutive({ positionName: "部長", name: "山田　太郎" }), false);
  assert.equal(isExecutive({ positionName: null, name: "山田　太郎" }), false);
  // 役職名で決まらない人も、氏名で経営に入れられる(全角・半角の空白は無視)
  assert.equal(isExecutive({ positionName: null, name: "長井　将" }), true);
  assert.equal(isExecutive({ positionName: "部長", name: "長井 将" }), true);
  assert.equal(isExecutive({ positionName: null, name: "長井　将太" }), false);
});

test("lineWorksTalkUrl: 1 対 1 のトークを開く App Link", () => {
  assert.equal(
    lineWorksTalkUrl("yamada@example.co.jp"),
    "https://line.worksmobile.com/message/send?version=26&emailList=yamada%40example.co.jp",
  );
});
