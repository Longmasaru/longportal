import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IP_FAILURE_LIMIT,
  LOGIN_FAILURE_LIMIT,
  clientIpFrom,
  isThrottled,
} from "./throttle-policy";

test("失敗が上限未満なら制限しない", () => {
  assert.equal(isThrottled({ loginFailures: 0, ipFailures: 0 }), false);
  assert.equal(isThrottled({ loginFailures: LOGIN_FAILURE_LIMIT - 1, ipFailures: 0 }), false);
  assert.equal(isThrottled({ loginFailures: 0, ipFailures: IP_FAILURE_LIMIT - 1 }), false);
});

test("同じ ID の失敗が上限に達したら制限する", () => {
  assert.equal(isThrottled({ loginFailures: LOGIN_FAILURE_LIMIT, ipFailures: 0 }), true);
  assert.equal(isThrottled({ loginFailures: LOGIN_FAILURE_LIMIT + 3, ipFailures: 0 }), true);
});

test("同じ接続元の失敗が上限に達したら、ID に関係なく制限する", () => {
  assert.equal(isThrottled({ loginFailures: 0, ipFailures: IP_FAILURE_LIMIT }), true);
});

test("接続元の上限は、ID ごとの上限より高い(会社の同じ出口から全員がつなぐ場合のため)", () => {
  assert.ok(IP_FAILURE_LIMIT > LOGIN_FAILURE_LIMIT * 5);
});

const h = (map: Record<string, string>) => ({ get: (n: string) => map[n.toLowerCase()] ?? null });

test("clientIpFrom: x-real-ip を優先し、なければ x-forwarded-for の先頭", () => {
  assert.equal(clientIpFrom(h({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "1.1.1.1" })), "203.0.113.5");
  assert.equal(clientIpFrom(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  assert.equal(clientIpFrom(h({})), null);
  assert.equal(clientIpFrom(undefined), null);
});
