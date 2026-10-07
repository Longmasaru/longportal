import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, diffDays, isIsoDate } from "./date";

test("addDays: 月・年またぎと閏年", () => {
  assert.equal(addDays("2026-10-01", -1), "2026-09-30");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2027-02-28", 1), "2027-03-01");
});

test("diffDays", () => {
  assert.equal(diffDays("2026-10-01", "2026-10-15"), 14);
  assert.equal(diffDays("2026-10-15", "2026-10-01"), -14);
  assert.equal(diffDays("2026-10-01", "2026-10-01"), 0);
});

test("isIsoDate: 形式と実在", () => {
  assert.equal(isIsoDate("2026-10-01"), true);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("2026/10/01"), false);
  assert.equal(isIsoDate(""), false);
});
