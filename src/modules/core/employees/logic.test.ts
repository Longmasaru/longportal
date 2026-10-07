import assert from "node:assert/strict";
import { test } from "node:test";
import { employeeWarnings, hasOpenPrimaryAssignment, planTransfer } from "./logic";

const TODAY = "2026-10-07";

test("planTransfer: 現在の主所属を異動日の前日で終了させる", () => {
  const plan = planTransfer([{ id: "a1", startDate: "2026-04-01", endDate: null }], "2026-11-01");
  assert.deepEqual(plan, { ok: true, endCurrent: { id: "a1", endDate: "2026-10-31" } });
});

test("planTransfer: 主所属が無ければ終了させるものは無い(初回の所属設定)", () => {
  assert.deepEqual(planTransfer([], "2026-11-01"), { ok: true, endCurrent: null });
});

test("planTransfer: 既に終了済みの所属は触らない", () => {
  const plan = planTransfer([{ id: "a1", startDate: "2026-04-01", endDate: "2026-06-30" }], "2026-11-01");
  assert.deepEqual(plan, { ok: true, endCurrent: null });
});

test("planTransfer: 終了日が異動日以降の所属は、異動日の前日に短縮する", () => {
  const plan = planTransfer(
    [{ id: "a1", startDate: "2026-04-01", endDate: "2027-03-31" }],
    "2026-11-01",
  );
  assert.deepEqual(plan, { ok: true, endCurrent: { id: "a1", endDate: "2026-10-31" } });
});

test("planTransfer: 異動日以降に開始する主所属があれば不可", () => {
  const plan = planTransfer([{ id: "a2", startDate: "2026-12-01", endDate: null }], "2026-11-01");
  assert.equal(plan.ok, false);
});

test("planTransfer: 異動日と同日に開始する主所属があれば不可", () => {
  const plan = planTransfer([{ id: "a2", startDate: "2026-11-01", endDate: null }], "2026-11-01");
  assert.equal(plan.ok, false);
});

test("hasOpenPrimaryAssignment: 終了していない主所属(未来開始を含む)があれば true", () => {
  assert.equal(hasOpenPrimaryAssignment([{ isPrimary: true, endDate: null }], TODAY), true);
  assert.equal(hasOpenPrimaryAssignment([{ isPrimary: true, endDate: TODAY }], TODAY), true);
});

test("hasOpenPrimaryAssignment: 終了済み・副所属のみ・所属なしは false", () => {
  assert.equal(hasOpenPrimaryAssignment([{ isPrimary: true, endDate: "2026-10-06" }], TODAY), false);
  assert.equal(hasOpenPrimaryAssignment([{ isPrimary: false, endDate: null }], TODAY), false);
  assert.equal(hasOpenPrimaryAssignment([], TODAY), false);
});

const base = {
  status: "active",
  hiredOn: "2026-04-01",
  leftOn: null,
  hasOpenPrimaryAssignment: true,
  hasCurrentPrimaryAssignment: true,
  hasRoleScopeMismatch: false,
  userStatus: null,
};

test("警告なし: 在籍中で主所属あり", () => {
  assert.deepEqual(employeeWarnings(base, TODAY), []);
});

test("警告: 主所属が未設定(入社日が遠い)", () => {
  const w = employeeWarnings(
    { ...base, status: "planned", hiredOn: "2027-04-01", hasOpenPrimaryAssignment: false, hasCurrentPrimaryAssignment: false, hasRoleScopeMismatch: false },
    TODAY,
  );
  assert.deepEqual(w.map((x) => x.code), ["unassigned"]);
});

test("警告: 主所属が未設定で入社日が 14 日以内なら強い警告", () => {
  const w = employeeWarnings(
    { ...base, status: "planned", hiredOn: "2026-10-21", hasOpenPrimaryAssignment: false, hasCurrentPrimaryAssignment: false, hasRoleScopeMismatch: false },
    TODAY,
  );
  assert.deepEqual(w.map((x) => x.code), ["unassigned_soon"]);
});

test("警告: 入社日を過ぎても planned のまま", () => {
  const w = employeeWarnings({ ...base, status: "planned", hiredOn: TODAY }, TODAY);
  assert.deepEqual(w.map((x) => x.code), ["planned_overdue"]);
});

test("警告: 退職済みなのにアカウントが有効", () => {
  const w = employeeWarnings(
    { ...base, status: "retired", leftOn: "2026-09-30", userStatus: "active" },
    TODAY,
  );
  assert.deepEqual(w.map((x) => x.code), ["account_active_but_gone"]);
});

test("警告: 退職日を過ぎた社員には未配属の警告を出さない", () => {
  const w = employeeWarnings(
    { ...base, status: "active", leftOn: "2026-10-06", hasOpenPrimaryAssignment: false, hasCurrentPrimaryAssignment: false, hasRoleScopeMismatch: false },
    TODAY,
  );
  assert.deepEqual(w, []);
});

test("警告: 在籍中だが主所属が開始前(今日時点の所属がない)", () => {
  const w = employeeWarnings({ ...base, hasCurrentPrimaryAssignment: false, hasRoleScopeMismatch: false }, TODAY);
  assert.deepEqual(w.map((x) => x.code), ["no_current_assignment"]);
});

test("警告なし: 入社予定で所属が開始前なのは通常の状態", () => {
  const w = employeeWarnings(
    { ...base, status: "planned", hiredOn: "2027-04-01", hasCurrentPrimaryAssignment: false, hasRoleScopeMismatch: false },
    TODAY,
  );
  assert.deepEqual(w, []);
});

test("警告: スコープ付きロールが現在の所属と合わない", () => {
  const w = employeeWarnings({ ...base, hasRoleScopeMismatch: true }, TODAY);
  assert.deepEqual(w.map((x) => x.code), ["role_scope_mismatch"]);
});

test("警告なし: 退職済みならロール不整合の警告は出さない", () => {
  const w = employeeWarnings(
    { ...base, status: "retired", leftOn: "2026-09-30", hasRoleScopeMismatch: true },
    TODAY,
  );
  assert.deepEqual(w, []);
});
