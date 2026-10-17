import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanText, phrases, splitBold } from "./typeset";

test("cleanText: 見えない文字を除き、位置合わせの全角スペースを詰める", () => {
  assert.equal(cleanText("**\u200b運転の準備\u200b**"), "**運転の準備**");
  assert.equal(cleanText("コレットの先端\u3000\u3000\u3000\u3000\u3000から約3mm"), "コレットの先端から約3mm");
  assert.equal(cleanText("M6  x  12"), "M6 x 12");
  assert.equal(cleanText("です。\n ネジが"), "です。\nネジが");
  assert.equal(cleanText("A. 部品"), "A. 部品");
});

test("splitBold: ** の囲みを太字にする", () => {
  assert.deepEqual(splitBold("**運転の準備**"), [{ text: "運転の準備", bold: true }]);
  assert.deepEqual(splitBold("前**中**後"), [
    { text: "前", bold: false },
    { text: "中", bold: true },
    { text: "後", bold: false },
  ]);
  assert.deepEqual(splitBold("2 * 3"), [{ text: "2 * 3", bold: false }]);
});

test("phrases: 語の途中では区切らない", () => {
  const parts = phrases("装置の運転中、操作者以外は装置の側に近寄らない。");
  assert.equal(parts.join(""), "装置の運転中、操作者以外は装置の側に近寄らない。");
  assert.ok(parts.includes("近寄らない。"));
  assert.deepEqual(phrases(""), []);
});
