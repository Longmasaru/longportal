import assert from "node:assert/strict";
import { test } from "node:test";
import { newPasswordChecks, normalizeLoginId, passwordInputWarnings } from "./input-checks";

test("normalizeLoginId: 全角を半角に、空白を除き、小文字にする", () => {
  assert.equal(normalizeLoginId("１００５"), "1005");
  assert.equal(normalizeLoginId(" 0052 "), "0052");
  assert.equal(normalizeLoginId("10 05"), "1005");
  assert.equal(normalizeLoginId("ＡＢＣ"), "abc");
});

test("passwordInputWarnings: 全角と前後の空白に気づかせる", () => {
  assert.deepEqual(passwordInputWarnings("abcd1234"), []);
  assert.equal(passwordInputWarnings("ａｂｃ123").length, 1);
  assert.equal(passwordInputWarnings("あいう").length, 1);
  assert.equal(passwordInputWarnings(" abc").length, 1);
  assert.equal(passwordInputWarnings("ａ ").length, 2);
});

test("newPasswordChecks: 文字数・現在との違い・確認の一致", () => {
  const short = newPasswordChecks("abc", "", "old");
  assert.deepEqual(
    short.map((c) => c.ok),
    [false, true, false],
  );
  assert.match(short[0].label, /あと5文字/);
  assert.deepEqual(
    newPasswordChecks("abcd1234", "abcd1234", "abcd1234").map((c) => c.ok),
    [true, false, true],
  );
  // 現在のパスワードがない画面(メールからの再設定)では、2 項目だけ
  assert.deepEqual(
    newPasswordChecks("abcd1234", "abcd1234").map((c) => c.ok),
    [true, true],
  );
});
