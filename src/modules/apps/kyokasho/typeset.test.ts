import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanText, isSoftBreak, phrases, softenLines, splitBold } from "./typeset";

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

test("softenLines: セルの中で手で入れた改行はつなぎ、文の終わりや項目の始まりの改行は残す", () => {
  assert.equal(softenLines("火花が\n　散って\n引火する\n（火傷）"), "火花が散って引火する（火傷）");
  assert.equal(softenLines("≪業務内容≫\n工作機械を扱います。\n溶接後に確認します。"), "≪業務内容≫\n工作機械を扱います。\n溶接後に確認します。");
  assert.equal(softenLines("寸法線\n引出線"), "寸法線\n引出線");
  assert.equal(softenLines("サンダー加工\nにより火花や\n刃が\n飛散"), "サンダー加工により火花や刃が飛散");
  assert.equal(softenLines("注意点\n・火花\n・漏電"), "注意点\n・火花\n・漏電");
  assert.equal(softenLines("M6 x\n12 の\nネジ"), "M6 x\n12 のネジ");
  assert.ok(!isSoftBreak("手順1)", ""));
});

test("絵文字の組み合わせを壊さない", () => {
  const text = "複数機💆‍♀️をまとめて紹介";
  assert.equal(cleanText(text), text);
  const parts = phrases(text);
  assert.equal(parts.join(""), text);
  assert.ok(parts.some((p) => p.includes("💆‍♀️")));
});
