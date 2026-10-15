import assert from "node:assert/strict";
import { test } from "node:test";
import { joinName, joinNameKana, splitName } from "./names";

test("splitName: 日本語の氏名は、最初の空白の前が姓", () => {
  assert.deepEqual(splitName("山田　太郎"), { family: "山田", given: "太郎" });
  assert.deepEqual(splitName("山田 太郎"), { family: "山田", given: "太郎" });
});

test("splitName: 英字だけの氏名は、最後の語が名(ミドルネームまでが姓)", () => {
  assert.deepEqual(splitName("LE QUOC AN"), { family: "LE QUOC", given: "AN" });
  assert.deepEqual(splitName("JANE DOE"), { family: "JANE", given: "DOE" });
});

test("splitName: 空白がなければ全体を姓に、空なら空", () => {
  assert.deepEqual(splitName("山田太郎"), { family: "山田太郎", given: null });
  assert.deepEqual(splitName("  "), { family: "", given: null });
});

test("splitName: かなは、氏名の判定(英字だけか)に合わせて分ける", () => {
  assert.deepEqual(splitName("レ　クオック　アン", true), {
    family: "レ　クオック",
    given: "アン",
  });
  assert.deepEqual(splitName("ヤマダ　タロウ", false), { family: "ヤマダ", given: "タロウ" });
  // 外国籍の方のかなは中黒でも区切る(最後が名)
  assert.deepEqual(splitName("レ・クオック・アン", true), { family: "レ・クオック", given: "アン" });
  assert.equal(joinNameKana("レ・クオック", "アン"), "レ・クオック・アン");
});

test("joinName / joinNameKana: 英字は半角空白、それ以外は全角空白。分けてつなぐと元に戻る", () => {
  assert.equal(joinName("山田", "太郎"), "山田　太郎");
  assert.equal(joinName("LE QUOC", "AN"), "LE QUOC AN");
  assert.equal(joinName("山田太郎", null), "山田太郎");
  assert.equal(joinNameKana("ヤマダ", "タロウ"), "ヤマダ　タロウ");
  assert.equal(joinNameKana(null, null), null);
  for (const name of ["山田　太郎", "LE QUOC AN", "山田太郎"]) {
    const s = splitName(name);
    assert.equal(joinName(s.family, s.given), name);
  }
});
