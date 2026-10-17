import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Grant } from "@/modules/core/access/grants";
import { ageOn, canManageEmployee, leaveSummary, pageMode, radarPoint, recordVisibleTo, tenureOn, trend } from "./logic";

const CODE = "hr.records.manage";
const LOC_A = "loc-a";
const LOC_B = "loc-b";
const DEPT_X = "dept-x";
const DEPT_Y = "dept-y";

const grant = (locationId: string | null, departmentId: string | null, code = CODE): Grant => ({
  permissionCode: code,
  locationId,
  departmentId,
});

describe("canManageEmployee", () => {
  it("全社の割当なら、所属のない社員も含めて全員", () => {
    assert.equal(canManageEmployee([grant(null, null)], CODE, []), true);
    assert.equal(canManageEmployee([grant(null, null)], CODE, [{ locationId: LOC_B, departmentId: DEPT_Y }]), true);
  });

  it("部署つきの割当は、その部署の社員だけ", () => {
    const grants = [grant(null, DEPT_X)];
    assert.equal(canManageEmployee(grants, CODE, [{ locationId: LOC_A, departmentId: DEPT_X }]), true);
    assert.equal(canManageEmployee(grants, CODE, [{ locationId: LOC_A, departmentId: DEPT_Y }]), false);
    assert.equal(canManageEmployee(grants, CODE, []), false);
  });

  it("拠点 AND 部署の割当は、同じ 1 件の所属が両方を満たすときだけ", () => {
    const grants = [grant(LOC_A, DEPT_X)];
    assert.equal(canManageEmployee(grants, CODE, [{ locationId: LOC_A, departmentId: DEPT_X }]), true);
    assert.equal(
      canManageEmployee(grants, CODE, [
        { locationId: LOC_A, departmentId: DEPT_Y },
        { locationId: LOC_B, departmentId: DEPT_X },
      ]),
      false,
    );
  });

  it("別の権限では管理できない", () => {
    assert.equal(canManageEmployee([grant(null, null, "core.employees.manage")], CODE, []), false);
  });
});

describe("pageMode / recordVisibleTo", () => {
  it("自分のページは、権限があっても本人の見え方", () => {
    assert.equal(pageMode("e1", "e1", true), "self");
    assert.equal(pageMode("e1", "e1", false), "self");
  });

  it("他人のページは、権限があれば管理、なければ見られない", () => {
    assert.equal(pageMode("e1", "e2", true), "manager");
    assert.equal(pageMode("e1", "e2", false), "none");
    assert.equal(pageMode(null, "e2", true), "manager");
  });

  it("本人には公開の記録だけ、管理者にはすべて見える", () => {
    assert.equal(recordVisibleTo("self", "employee"), true);
    assert.equal(recordVisibleTo("self", "managers"), false);
    assert.equal(recordVisibleTo("manager", "managers"), true);
    assert.equal(recordVisibleTo("none", "employee"), false);
  });
});

describe("ageOn / tenureOn", () => {
  it("誕生日の前日までは前の年齢", () => {
    assert.equal(ageOn("1965-02-06", "2026-02-05"), 60);
    assert.equal(ageOn("1965-02-06", "2026-02-06"), 61);
    assert.equal(ageOn("2000-02-29", "2026-02-28"), 25);
    assert.equal(ageOn("2000-02-29", "2026-03-01"), 26);
  });

  it("勤続年数は満の年と月(シートの「39年6ヶ月」と同じ数え方)", () => {
    assert.deepEqual(tenureOn("1987-04-01", "2026-10-16"), { years: 39, months: 6 });
    assert.deepEqual(tenureOn("1995-09-21", "2026-10-16"), { years: 31, months: 0 });
    assert.deepEqual(tenureOn("2026-10-16", "2026-10-16"), { years: 0, months: 0 });
    assert.equal(tenureOn("2026-11-01", "2026-10-16"), null);
  });
});

describe("leaveSummary / trend", () => {
  it("残日数と消化率(シートの例: 付与 10・取得 1 → 残 9・10%)", () => {
    assert.deepEqual(leaveSummary(10, 1), { remaining: 9, rate: 10 });
    assert.deepEqual(leaveSummary(20, 7.5), { remaining: 12.5, rate: 37.5 });
    assert.equal(leaveSummary(null, 1), null);
    assert.equal(leaveSummary(0, 0), null);
  });

  it("前回と今回の比較", () => {
    assert.equal(trend(3, 4), "up");
    assert.equal(trend(4, 4), "flat");
    assert.equal(trend(4, 2), "down");
    assert.equal(trend(null, 2), null);
  });
});

describe("radarPoint", () => {
  it("1 本目は真上、時計回りに並ぶ", () => {
    assert.deepEqual(radarPoint(0, 4, 5, 5, 100, 0, 0), { x: 0, y: -100 });
    assert.deepEqual(radarPoint(1, 4, 5, 5, 100, 0, 0), { x: 100, y: 0 });
    assert.deepEqual(radarPoint(2, 4, 5, 5, 100, 0, 0), { x: 0, y: 100 });
  });
  it("値に比例し、範囲外は丸める", () => {
    assert.deepEqual(radarPoint(0, 5, 3, 5, 100, 50, 50), { x: 50, y: -10 });
    assert.deepEqual(radarPoint(0, 5, 0, 5, 100, 50, 50), { x: 50, y: 50 });
    assert.deepEqual(radarPoint(0, 5, 9, 5, 100, 50, 50), { x: 50, y: -50 });
  });
});
