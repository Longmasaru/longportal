import assert from "node:assert/strict";
import { test } from "node:test";
import type { AudienceDefinition } from "./definition";
import { definitionSchema } from "./definition";
import { matchesAudience, monthsOfTenure, type EmployeeContext } from "./evaluate";

const TODAY = "2026-10-07";
const HAKUSAN = "11111111-1111-4111-8111-111111111111";
const GENKO = "22222222-2222-4222-8222-222222222222";
const BRAKE = "33333333-3333-4333-8333-333333333333";
const WELD = "44444444-4444-4444-8444-444444444444";
const REGULAR = "55555555-5555-4555-8555-555555555555";
const PART = "66666666-6666-4666-8666-666666666666";
const MANAGER = "77777777-7777-4777-8777-777777777777";

const emp = (over: Partial<EmployeeContext> = {}): EmployeeContext => ({
  employeeId: "e1",
  status: "active",
  hiredOn: "2020-04-01",
  leftOn: null,
  positionId: null,
  positionIsManagement: false,
  employmentTypeId: REGULAR,
  assignments: [{ departmentId: BRAKE, locationId: HAKUSAN }],
  ...over,
});

const def = (...groups: AudienceDefinition["groups"]): AudienceDefinition => ({ groups });
const all = (): AudienceDefinition => def({ conditions: [] });

test("グループが 0 個の Audience は誰も対象にしない(deny by default)", () => {
  assert.equal(matchesAudience({ groups: [] }, emp(), TODAY), false);
});

test("条件が 0 個のグループ(全社員)は、いまアクセスできる全員が対象", () => {
  assert.equal(matchesAudience(all(), emp(), TODAY), true);
  assert.equal(matchesAudience(all(), emp({ assignments: [] }), TODAY), true);
});

test("アクセスできない社員は、全社員でも対象外(入社予定・退職済み・入社前・退職日の翌日)", () => {
  assert.equal(matchesAudience(all(), emp({ status: "planned" }), TODAY), false);
  assert.equal(matchesAudience(all(), emp({ status: "retired", leftOn: "2026-09-30" }), TODAY), false);
  assert.equal(matchesAudience(all(), emp({ hiredOn: "2026-10-08" }), TODAY), false);
  assert.equal(matchesAudience(all(), emp({ leftOn: "2026-10-06" }), TODAY), false);
  assert.equal(matchesAudience(all(), emp({ leftOn: TODAY }), TODAY), true);
  assert.equal(matchesAudience(all(), emp({ status: "leave" }), TODAY), true);
});

test("拠点条件: 白山工場の全員", () => {
  const d = def({ conditions: [{ attribute: "location", operator: "in", value: [HAKUSAN] }] });
  assert.equal(matchesAudience(d, emp(), TODAY), true);
  assert.equal(matchesAudience(d, emp({ assignments: [{ departmentId: BRAKE, locationId: GENKO }] }), TODAY), false);
});

test("条件の複数の値は OR(部署が A か B)", () => {
  const d = def({ conditions: [{ attribute: "department", operator: "in", value: [BRAKE, WELD] }] });
  assert.equal(matchesAudience(d, emp({ assignments: [{ departmentId: WELD, locationId: GENKO }] }), TODAY), true);
});

test("所属条件が必要なのに配属が未確定の社員は、所属条件のグループには入らない", () => {
  const d = def({ conditions: [{ attribute: "location", operator: "in", value: [HAKUSAN] }] });
  assert.equal(matchesAudience(d, emp({ assignments: [] }), TODAY), false);
});

const HAKUSAN_AND_BRAKE = def({
  conditions: [
    { attribute: "location", operator: "in", value: [HAKUSAN] },
    { attribute: "department", operator: "in", value: [BRAKE] },
  ],
});

test("白山工場 かつ ブレーキ: 1 件の所属が両方を満たす人は対象", () => {
  assert.equal(matchesAudience(HAKUSAN_AND_BRAKE, emp(), TODAY), true);
});

test("兼務: 別々の所属で条件を満たしても『白山工場かつブレーキ』には入らない", () => {
  const c = emp({
    assignments: [
      { departmentId: WELD, locationId: HAKUSAN }, // 白山工場 / 溶接
      { departmentId: BRAKE, locationId: GENKO }, // 現工場 / ブレーキ
    ],
  });
  assert.equal(matchesAudience(HAKUSAN_AND_BRAKE, c, TODAY), false);
});

test("兼務: どちらかの所属が両方を満たせば対象", () => {
  const c = emp({
    assignments: [
      { departmentId: WELD, locationId: GENKO },
      { departmentId: BRAKE, locationId: HAKUSAN },
    ],
  });
  assert.equal(matchesAudience(HAKUSAN_AND_BRAKE, c, TODAY), true);
});

test("グループ間は OR(白山工場のブレーキ、または 現工場の溶接)", () => {
  const d = def(
    HAKUSAN_AND_BRAKE.groups[0],
    {
      conditions: [
        { attribute: "location", operator: "in", value: [GENKO] },
        { attribute: "department", operator: "in", value: [WELD] },
      ],
    },
  );
  assert.equal(matchesAudience(d, emp({ assignments: [{ departmentId: WELD, locationId: GENKO }] }), TODAY), true);
  assert.equal(matchesAudience(d, emp({ assignments: [{ departmentId: WELD, locationId: HAKUSAN }] }), TODAY), false);
});

test("社員条件と所属条件の組み合わせ(AND)", () => {
  const d = def({
    conditions: [
      { attribute: "employment_type", operator: "in", value: [REGULAR] },
      { attribute: "location", operator: "in", value: [HAKUSAN] },
    ],
  });
  assert.equal(matchesAudience(d, emp(), TODAY), true);
  assert.equal(matchesAudience(d, emp({ employmentTypeId: PART }), TODAY), false);
});

test("管理職: 役職の管理職フラグで判定。役職なしは管理職ではない", () => {
  const isMgr = def({ conditions: [{ attribute: "is_management", operator: "is", value: true }] });
  const notMgr = def({ conditions: [{ attribute: "is_management", operator: "is", value: false }] });
  const manager = emp({ positionId: MANAGER, positionIsManagement: true });
  assert.equal(matchesAudience(isMgr, manager, TODAY), true);
  assert.equal(matchesAudience(isMgr, emp(), TODAY), false);
  assert.equal(matchesAudience(notMgr, emp(), TODAY), true);
  assert.equal(matchesAudience(notMgr, manager, TODAY), false);
});

test("役職: 役職なしの社員は、役職条件には入らない", () => {
  const d = def({ conditions: [{ attribute: "position", operator: "in", value: [MANAGER] }] });
  assert.equal(matchesAudience(d, emp({ positionId: MANAGER }), TODAY), true);
  assert.equal(matchesAudience(d, emp(), TODAY), false);
});

test("monthsOfTenure: 満の月数", () => {
  assert.equal(monthsOfTenure("2026-04-01", "2026-10-07"), 6);
  assert.equal(monthsOfTenure("2026-04-08", "2026-10-07"), 5);
  assert.equal(monthsOfTenure("2025-10-07", "2026-10-07"), 12);
  assert.equal(monthsOfTenure("2025-10-08", "2026-10-07"), 11);
  assert.equal(monthsOfTenure("2026-10-07", "2026-10-07"), 0);
});

test("入社 1 年未満(12か月未満)の境界", () => {
  const d = def({ conditions: [{ attribute: "tenure_months", operator: "lt", value: 12 }] });
  assert.equal(matchesAudience(d, emp({ hiredOn: "2025-10-08" }), TODAY), true); // 11か月
  assert.equal(matchesAudience(d, emp({ hiredOn: "2025-10-07" }), TODAY), false); // ちょうど12か月
});

test("入社から 3 年以上", () => {
  const d = def({ conditions: [{ attribute: "tenure_months", operator: "gte", value: 36 }] });
  assert.equal(matchesAudience(d, emp({ hiredOn: "2023-10-07" }), TODAY), true);
  assert.equal(matchesAudience(d, emp({ hiredOn: "2023-10-08" }), TODAY), false);
});

test("定義の検証: 正しい定義は通り、不正な定義は拒否される", () => {
  assert.equal(definitionSchema.safeParse({ groups: [] }).success, true);
  assert.equal(definitionSchema.safeParse(HAKUSAN_AND_BRAKE).success, true);
  assert.equal(
    definitionSchema.safeParse({ groups: [{ conditions: [{ attribute: "location", operator: "in", value: [] }] }] }).success,
    false,
  );
  assert.equal(
    definitionSchema.safeParse({ groups: [{ conditions: [{ attribute: "location", operator: "in", value: ["x"] }] }] }).success,
    false,
  );
  assert.equal(
    definitionSchema.safeParse({ groups: [{ conditions: [{ attribute: "unknown", operator: "in", value: [] }] }] }).success,
    false,
  );
  assert.equal(
    definitionSchema.safeParse({ groups: [{ conditions: [{ attribute: "tenure_months", operator: "lt", value: 1.5 }] }] }).success,
    false,
  );
});
