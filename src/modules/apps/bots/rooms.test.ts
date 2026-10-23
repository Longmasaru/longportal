import assert from "node:assert/strict";
import { test } from "node:test";
import { isOnRoster, pickLineWorksMembers } from "./rooms";

test("在籍中かを入社日・退職日・状態で判定する", () => {
  const today = "2026-10-22";
  assert.equal(isOnRoster({ hiredOn: "2020-04-01", leftOn: null, status: "active" }, today), true);
  assert.equal(isOnRoster({ hiredOn: "2020-04-01", leftOn: null, status: "leave" }, today), true);
  assert.equal(isOnRoster({ hiredOn: "2026-11-01", leftOn: null, status: "active" }, today), false);
  assert.equal(isOnRoster({ hiredOn: "2020-04-01", leftOn: "2026-10-22", status: "active" }, today), true);
  assert.equal(isOnRoster({ hiredOn: "2020-04-01", leftOn: "2026-10-21", status: "retired" }, today), false);
  assert.equal(isOnRoster({ hiredOn: "2020-04-01", leftOn: null, status: "planned" }, today), false);
});

test("見つからない人は名前で返し、同じ ID は 1 回だけ入れる", () => {
  const ids: Record<string, string | null> = { 長井: "u1", 及川: "u2", 南: null, 長井2: "u1" };
  const result = pickLineWorksMembers(
    [{ name: "長井" }, { name: "及川" }, { name: "南" }, { name: "長井2" }],
    (e) => ids[e.name] ?? null,
  );
  assert.deepEqual(result, { memberIds: ["u1", "u2"], missing: ["南"] });
});
