import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateEmployeeAccess, evaluateUserAccess } from "./evaluate";

const TODAY = "2026-10-07";
const emp = (over: Partial<{ status: string; hiredOn: string; leftOn: string | null }> = {}) => ({
  status: "active",
  hiredOn: "2026-04-01",
  leftOn: null,
  ...over,
});

test("在籍中の active は利用可", () => {
  assert.equal(evaluateEmployeeAccess(emp(), TODAY), null);
});

test("休職(leave)は利用可", () => {
  assert.equal(evaluateEmployeeAccess(emp({ status: "leave" }), TODAY), null);
});

test("planned は deny", () => {
  assert.equal(evaluateEmployeeAccess(emp({ status: "planned" }), TODAY), "employee_not_active");
});

test("retired は deny(退職日が未来でも)", () => {
  assert.equal(
    evaluateEmployeeAccess(emp({ status: "retired", leftOn: "2026-12-31" }), TODAY),
    "employee_not_active",
  );
});

test("未知の status は deny", () => {
  assert.equal(evaluateEmployeeAccess(emp({ status: "foo" }), TODAY), "employee_not_active");
});

test("hired_on が未来なら status が active でも deny", () => {
  assert.equal(evaluateEmployeeAccess(emp({ hiredOn: "2026-10-08" }), TODAY), "not_yet_hired");
});

test("hired_on が今日なら利用可", () => {
  assert.equal(evaluateEmployeeAccess(emp({ hiredOn: TODAY }), TODAY), null);
});

test("退職日(left_on)当日は利用可", () => {
  assert.equal(evaluateEmployeeAccess(emp({ leftOn: TODAY }), TODAY), null);
});

test("退職日の翌日から deny(status が active のままでも)", () => {
  assert.equal(evaluateEmployeeAccess(emp({ leftOn: "2026-10-06" }), TODAY), "left_company");
});

test("未来の退職予定日は利用可", () => {
  assert.equal(evaluateEmployeeAccess(emp({ leftOn: "2026-12-31" }), TODAY), null);
});

test("user が disabled なら社員の状態に関係なく deny", () => {
  assert.equal(evaluateUserAccess({ status: "disabled" }, emp(), TODAY), "user_disabled");
  assert.equal(evaluateUserAccess({ status: "disabled" }, null, TODAY), "user_disabled");
});

test("社員以外の user(employee なし)は active なら利用可", () => {
  assert.equal(evaluateUserAccess({ status: "active" }, null, TODAY), null);
});

test("user が active でも、紐づく社員が退職済みなら deny", () => {
  assert.equal(
    evaluateUserAccess({ status: "active" }, emp({ leftOn: "2026-10-06" }), TODAY),
    "left_company",
  );
});
