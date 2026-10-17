import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "./content";
import { flowCell, groupImages, joinBrokenLines, tableCards, tableKind } from "./layout";

const p = (text: string, bold = false): Block => ({ type: "paragraph", inlines: [bold ? { text, bold } : { text }] });
const img = (id: string): Block => ({ type: "image", id, alt: "" });

test("flowCell: セルの中の手で入れた改行と字下げを除き、続けて読める文にする", () => {
  assert.deepEqual(flowCell([p("　　火花が"), p("　　散って"), p("　　引火する"), p("（火傷）")]), [
    { type: "paragraph", inlines: [{ text: "火花が" }, { text: "散って" }, { text: "引火する" }, { text: "（火傷）" }] },
  ]);
  // 区切りの行と、語の並び(寸法線/引出線)はつながない。
  assert.deepEqual(flowCell([p("≪業務内容≫"), p("工作機械の"), p("カバー")]), [
    p("≪業務内容≫"),
    { type: "paragraph", inlines: [{ text: "工作機械の" }, { text: "カバー" }] },
  ]);
  assert.deepEqual(flowCell([p("寸法線"), p("引出線")]), [p("寸法線"), p("引出線")]);
  assert.deepEqual(flowCell([p("ボルトの\n ネジ")]), [p("ボルトのネジ")]);
  assert.deepEqual(flowCell([p("火花が散る", true), p("　（火傷）", true)]), [
    {
      type: "paragraph",
      inlines: [
        { text: "火花が散る", bold: true },
        { text: "（火傷）", bold: true },
      ],
    },
  ]);
});

test("groupImages: 続く画像をまとめる", () => {
  const placed = groupImages([p("a"), img("1"), img("2"), img("3"), p("b"), img("4")]);
  assert.deepEqual(
    placed.map((x) => (x.kind === "images" ? x.ids.join(",") : x.block.type)),
    ["paragraph", "1,2,3", "paragraph", "image"],
  );
});

test("tableKind: セル 1 つは囲み、見出しの行がある表はカード、縦の結合がある表は表のまま", () => {
  assert.equal(tableKind({ type: "table", rows: [[[p("業務内容")]]] }), "callout");
  assert.equal(
    tableKind({
      type: "table",
      rows: [
        [[p("事象")], [p("作業者")]],
        [[p("火花")], [p("注意")]],
      ],
    }),
    "cards",
  );
  assert.equal(
    tableKind({
      type: "table",
      rows: [[[p("a")], [p("b")]], [[p("c")], [p("d")]], [[p("e")]]],
      spans: [{ row: 1, cell: 0, rowSpan: 2, colSpan: 1 }],
    }),
    "table",
  );
});

test("tableCards: 1 列目を題にし、横につながったセルは項目名をまとめる", () => {
  const cards = tableCards({
    type: "table",
    rows: [
      [[p("事象")], [p("作業者")], [p("歩行者")]],
      [[p("火花")], [p("注意する")], [p("近づかない")]],
      [[p("やけど")], [p("触れない")]],
    ],
    spans: [{ row: 2, cell: 1, rowSpan: 1, colSpan: 2 }],
  });
  assert.deepEqual(cards[0], {
    title: [p("火花")],
    fields: [
      { label: [p("作業者")], value: [p("注意する")] },
      { label: [p("歩行者")], value: [p("近づかない")] },
    ],
  });
  assert.deepEqual(cards[1].fields, [
    { label: [{ type: "paragraph", inlines: [{ text: "作業者" }, { text: "・" }, { text: "歩行者" }] }], value: [p("触れない")] },
  ]);
});

test("joinBrokenLines: 文の途中で切れた行だけをつなぐ", () => {
  assert.deepEqual(joinBrokenLines([p("※パスワード、情報管理には注意が"), p("必要です。"), p("次の文です。"), p("▼見出し")]), [
    { type: "paragraph", inlines: [{ text: "※パスワード、情報管理には注意が" }, { text: "必要です。" }] },
    p("次の文です。"),
    p("▼見出し"),
  ]);
  assert.deepEqual(joinBrokenLines([p("太字", true), p("続き")]), [p("太字", true), p("続き")]);
  assert.deepEqual(joinBrokenLines([p("工具の一覧"), p("ドライバー")]), [p("工具の一覧"), p("ドライバー")]);
  assert.deepEqual(joinBrokenLines([p("※パスワード、情報管理には注意が", true), p("必要です。", true)]), [
    {
      type: "paragraph",
      inlines: [
        { text: "※パスワード、情報管理には注意が", bold: true },
        { text: "必要です。", bold: true },
      ],
    },
  ]);
});
