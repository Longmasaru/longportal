import assert from "node:assert/strict";
import { test } from "node:test";
import { describeDefinition, type MasterLookup } from "./summary";

const HAKUSAN = "11111111-1111-4111-8111-111111111111";
const OLD = "22222222-2222-4222-8222-222222222222";
const BRAKE = "33333333-3333-4333-8333-333333333333";

const lookup: MasterLookup = {
  department: new Map([[BRAKE, { name: "ブレーキ", isActive: true }]]),
  location: new Map([
    [HAKUSAN, { name: "白山工場", isActive: true }],
    [OLD, { name: "旧工場", isActive: false }],
  ]),
  position: new Map(),
  employment_type: new Map(),
};

test("条件を文章にする(グループ内は かつ)", () => {
  const d = describeDefinition(
    {
      groups: [
        {
          conditions: [
            { attribute: "location", operator: "in", value: [HAKUSAN] },
            { attribute: "department", operator: "in", value: [BRAKE] },
          ],
        },
      ],
    },
    lookup,
  );
  assert.deepEqual(d.groups, ["拠点: 白山工場 かつ 部署: ブレーキ"]);
  assert.equal(d.hasStaleReference, false);
});

test("条件が 0 個のグループは「全社員」", () => {
  assert.deepEqual(describeDefinition({ groups: [{ conditions: [] }] }, lookup).groups, ["全社員(条件なし)"]);
});

test("管理職・入社からの期間", () => {
  const d = describeDefinition(
    {
      groups: [
        {
          conditions: [
            { attribute: "is_management", operator: "is", value: true },
            { attribute: "tenure_months", operator: "lt", value: 12 },
          ],
        },
      ],
    },
    lookup,
  );
  assert.deepEqual(d.groups, ["管理職 かつ 入社から 12か月未満"]);
});

test("無効・不明なマスタの参照を検出する", () => {
  const d = describeDefinition(
    {
      groups: [
        {
          conditions: [
            { attribute: "location", operator: "in", value: [OLD] },
            { attribute: "department", operator: "in", value: ["99999999-9999-4999-8999-999999999999"] },
          ],
        },
      ],
    },
    lookup,
  );
  assert.deepEqual(d.groups, ["拠点: 旧工場(無効) かつ 部署: (不明)"]);
  assert.equal(d.hasStaleReference, true);
});
