import assert from "node:assert/strict";
import { test } from "node:test";
import { grantAllows, hasAnyGrant, hasGlobalGrant, scopeFitsAssignments, type Grant } from "./grants";

const HAKUSAN = "loc-hakusan";
const GENKO = "loc-genko";
const BRAKE = "dep-brake";
const WELD = "dep-weld";

const g = (locationId: string | null, departmentId: string | null, code = "equipment.approve"): Grant => ({
  permissionCode: code,
  locationId,
  departmentId,
});

test("全社(global)の割当は、どの対象にも使える(所属が NULL のデータにも)", () => {
  assert.equal(grantAllows([g(null, null)], "equipment.approve", { locationId: HAKUSAN, departmentId: BRAKE }), true);
  assert.equal(grantAllows([g(null, null)], "equipment.approve", {}), true);
});

test("拠点スコープ: 同じ拠点なら許可、別拠点は deny", () => {
  const grants = [g(HAKUSAN, null)];
  assert.equal(grantAllows(grants, "equipment.approve", { locationId: HAKUSAN, departmentId: BRAKE }), true);
  assert.equal(grantAllows(grants, "equipment.approve", { locationId: GENKO, departmentId: BRAKE }), false);
});

test("拠点スコープ: 対象データの拠点が NULL なら deny", () => {
  assert.equal(grantAllows([g(HAKUSAN, null)], "equipment.approve", { locationId: null }), false);
  assert.equal(grantAllows([g(HAKUSAN, null)], "equipment.approve", {}), false);
});

test("部署スコープ: 同じ部署なら許可、別部署は deny", () => {
  const grants = [g(null, BRAKE)];
  assert.equal(grantAllows(grants, "equipment.approve", { locationId: GENKO, departmentId: BRAKE }), true);
  assert.equal(grantAllows(grants, "equipment.approve", { locationId: GENKO, departmentId: WELD }), false);
});

test("拠点 AND 部署: 両方が一致したときだけ許可", () => {
  const grants = [g(HAKUSAN, BRAKE)];
  assert.equal(grantAllows(grants, "equipment.approve", { locationId: HAKUSAN, departmentId: BRAKE }), true);
  assert.equal(grantAllows(grants, "equipment.approve", { locationId: HAKUSAN, departmentId: WELD }), false);
  assert.equal(grantAllows(grants, "equipment.approve", { locationId: GENKO, departmentId: BRAKE }), false);
});

test("別の権限 code には使えない", () => {
  assert.equal(grantAllows([g(null, null, "education.view")], "equipment.approve", {}), false);
});

test("複数の割当は、どれか 1 つが許せば許可(OR)", () => {
  const grants = [g(HAKUSAN, null), g(GENKO, WELD)];
  assert.equal(grantAllows(grants, "equipment.approve", { locationId: GENKO, departmentId: WELD }), true);
  assert.equal(grantAllows(grants, "equipment.approve", { locationId: GENKO, departmentId: BRAKE }), false);
});

test("hasGlobalGrant: スコープ付きだけでは false", () => {
  assert.equal(hasGlobalGrant([g(HAKUSAN, null)], "equipment.approve"), false);
  assert.equal(hasGlobalGrant([g(null, null)], "equipment.approve"), true);
  assert.equal(hasAnyGrant([g(HAKUSAN, null)], "equipment.approve"), true);
  assert.equal(hasAnyGrant([], "equipment.approve"), false);
});

test("scopeFitsAssignments: 全社の割当は常に適合", () => {
  assert.equal(scopeFitsAssignments({ locationId: null, departmentId: null }, []), true);
});

test("scopeFitsAssignments: 所属が無ければ、スコープ付きは不適合", () => {
  assert.equal(scopeFitsAssignments({ locationId: HAKUSAN, departmentId: null }, []), false);
});

test("scopeFitsAssignments: 拠点だけ指定 → いずれかの所属の拠点が一致すれば適合", () => {
  const a = [{ locationId: GENKO, departmentId: BRAKE }];
  assert.equal(scopeFitsAssignments({ locationId: HAKUSAN, departmentId: null }, a), false);
  assert.equal(scopeFitsAssignments({ locationId: GENKO, departmentId: null }, a), true);
});

test("scopeFitsAssignments: 拠点 AND 部署は、同じ 1 件の所属が両方を満たす必要がある", () => {
  const a = [
    { locationId: HAKUSAN, departmentId: WELD },
    { locationId: GENKO, departmentId: BRAKE },
  ];
  assert.equal(scopeFitsAssignments({ locationId: HAKUSAN, departmentId: BRAKE }, a), false);
  assert.equal(scopeFitsAssignments({ locationId: GENKO, departmentId: BRAKE }, a), true);
});
