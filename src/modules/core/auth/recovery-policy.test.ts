import assert from "node:assert/strict";
import { test } from "node:test";
import { emailSchema, isTokenUsable, maskEmail, tokenSchema } from "./recovery-policy";

test("emailSchema: 空白を除いて小文字にそろえ、形の違うものは拒否", () => {
  assert.equal(emailSchema.parse("  Taro.Yamada@E-Long.co.jp "), "taro.yamada@e-long.co.jp");
  assert.equal(emailSchema.safeParse("taro").success, false);
  assert.equal(emailSchema.safeParse("").success, false);
});

test("tokenSchema: 43 文字の base64url だけを受け付ける", () => {
  assert.equal(tokenSchema.safeParse("a".repeat(43)).success, true);
  assert.equal(tokenSchema.safeParse("a".repeat(42)).success, false);
  assert.equal(tokenSchema.safeParse(`${"a".repeat(42)}/`).success, false);
});

test("isTokenUsable: 期限内で未使用のときだけ使える", () => {
  const now = new Date("2026-10-18T10:00:00Z");
  const later = new Date("2026-10-18T10:30:00Z");
  const earlier = new Date("2026-10-18T09:59:00Z");
  assert.equal(isTokenUsable({ expiresAt: later, usedAt: null }, now), true);
  assert.equal(isTokenUsable({ expiresAt: earlier, usedAt: null }, now), false);
  assert.equal(isTokenUsable({ expiresAt: later, usedAt: earlier }, now), false);
});

test("maskEmail: 先頭 2 文字とドメインだけを見せる", () => {
  assert.equal(maskEmail("yamada@e-long.co.jp"), "ya****@e-long.co.jp");
  assert.equal(maskEmail("ab@x.jp"), "ab**@x.jp");
});
