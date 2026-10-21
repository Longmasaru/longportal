import assert from "node:assert/strict";
import { test } from "node:test";
import { canSkipCurrentPassword } from "./password-policy";

test("canSkipCurrentPassword: 初回ログインの直後(15 分以内)だけ、現在のパスワードを聞かない", () => {
  const now = new Date("2026-10-19T10:00:00Z");
  const min = (m: number) => new Date(now.getTime() - m * 60_000);
  assert.equal(canSkipCurrentPassword(true, min(1), now), true);
  assert.equal(canSkipCurrentPassword(true, min(15), now), true);
  assert.equal(canSkipCurrentPassword(true, min(16), now), false);
  assert.equal(canSkipCurrentPassword(false, min(1), now), false);
  assert.equal(canSkipCurrentPassword(true, null, now), false);
});
