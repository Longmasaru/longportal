import assert from "node:assert/strict";
import { test } from "node:test";
import { compareSessions, materialContentType, sessionInputSchema } from "./policy";

test("資料の種類: ブラウザの種類か拡張子で判断し、それ以外は受け付けない", () => {
  assert.equal(materialContentType("第1回ワークシート.pdf", "application/pdf"), "application/pdf");
  assert.equal(materialContentType("答えの見本.PDF", ""), "application/pdf");
  assert.equal(materialContentType("画面.jpeg", "application/octet-stream"), "image/jpeg");
  assert.equal(materialContentType("図.png", ""), "image/png");
  assert.equal(materialContentType("資料.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), null);
  assert.equal(materialContentType("拡張子なし", ""), null);
});

test("回の入力: タイトルは必須・100 字まで、実施日は空なら未定", () => {
  assert.deepEqual(sessionInputSchema.parse({ title: " 第1回 ", heldOn: "" }), { title: "第1回", heldOn: null });
  assert.equal(sessionInputSchema.parse({ title: "第1回", heldOn: "2026-10-17" }).heldOn, "2026-10-17");
  assert.equal(sessionInputSchema.safeParse({ title: "", heldOn: "" }).success, false);
  assert.equal(sessionInputSchema.safeParse({ title: "あ".repeat(101), heldOn: "" }).success, false);
  assert.equal(sessionInputSchema.safeParse({ title: "第1回", heldOn: "2026-13-01" }).success, false);
});

test("回の並び: 実施日順、未定は後ろ、同じなら並び順・作成順", () => {
  const at = (s: string) => new Date(s);
  const rows = [
    { id: "未定", heldOn: null, sortOrder: 0, createdAt: at("2026-10-01") },
    { id: "第2回", heldOn: "2026-11-07", sortOrder: 0, createdAt: at("2026-10-02") },
    { id: "第1回", heldOn: "2026-10-17", sortOrder: 0, createdAt: at("2026-10-03") },
    { id: "第1回の補足", heldOn: "2026-10-17", sortOrder: 0, createdAt: at("2026-10-04") },
  ];
  assert.deepEqual(
    rows.sort(compareSessions).map((r) => r.id),
    ["第1回", "第1回の補足", "第2回", "未定"],
  );
});
