import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, monthRange, shiftMonth, weekRange } from "./constants";

describe("arigato の日付計算", () => {
  it("週は月曜はじまり", () => {
    assert.deepEqual(weekRange("2026-10-15"), { start: "2026-10-12", end: "2026-10-18" }); // 木
    assert.deepEqual(weekRange("2026-10-12"), { start: "2026-10-12", end: "2026-10-18" }); // 月
    assert.deepEqual(weekRange("2026-10-18"), { start: "2026-10-12", end: "2026-10-18" }); // 日
  });

  it("月・年をまたぐ週", () => {
    assert.deepEqual(weekRange("2027-01-01"), { start: "2026-12-28", end: "2027-01-03" });
  });

  it("日の加算", () => {
    assert.equal(addDays("2026-10-12", -7), "2026-10-05");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  });

  it("月の範囲と移動", () => {
    assert.deepEqual(monthRange("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
    assert.deepEqual(monthRange("2026-10"), { start: "2026-10-01", end: "2026-10-31" });
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    assert.equal(shiftMonth("2026-10", 3), "2027-01");
  });
});
