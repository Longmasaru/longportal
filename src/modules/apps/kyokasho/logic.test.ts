import assert from "node:assert/strict";
import { test } from "node:test";
import { canViewBook, googleDocId, groupBooks, isValidSlug } from "./logic";

test("見られる教科書の判定(deny by default)", () => {
  const none = new Set<string>();
  const matched = new Set(["a1"]);
  assert.equal(canViewBook({ isPublished: true, target: "company", audienceId: null }, none, false), true);
  assert.equal(canViewBook({ isPublished: false, target: "company", audienceId: null }, none, false), false);
  assert.equal(canViewBook({ isPublished: true, target: "audience", audienceId: "a1" }, matched, false), true);
  assert.equal(canViewBook({ isPublished: true, target: "audience", audienceId: "a2" }, matched, false), false);
  assert.equal(canViewBook({ isPublished: true, target: "audience", audienceId: null }, matched, false), false);
  assert.equal(canViewBook({ isPublished: true, target: "unknown", audienceId: null }, none, false), false);
  // 管理する人は、非公開でも確認できる
  assert.equal(canViewBook({ isPublished: false, target: "audience", audienceId: "a2" }, none, true), true);
});

test("部署ごとにまとめる", () => {
  const groups = groupBooks([
    { department: "ブレーキ部", sortOrder: 20, title: "スタッド" },
    { department: "全部署共通", sortOrder: 0, title: "共通" },
    { department: "ブレーキ部", sortOrder: 10, title: "初級編" },
  ]);
  assert.deepEqual(
    groups.map((g) => [g.department, g.books.map((b) => b.title)]),
    [
      ["全部署共通", ["共通"]],
      ["ブレーキ部", ["初級編", "スタッド"]],
    ],
  );
});

test("URL に使う名前", () => {
  assert.equal(isValidSlug("brake-basic"), true);
  assert.equal(isValidSlug("Brake"), false);
  assert.equal(isValidSlug("-a"), false);
  assert.equal(isValidSlug("manage"), false);
  assert.equal(isValidSlug("images"), false);
});

test("元の Google ドキュメントの URL から文書の ID を取り出す", () => {
  const id = "1cACp1XIZxdqTOZxPVZBzAJBVuu3NhnW7grzajXMLOzo";
  assert.equal(googleDocId(`https://docs.google.com/document/d/${id}/edit?usp=sharing`), id);
  assert.equal(googleDocId(`https://docs.google.com/document/u/0/d/${id}/edit`), id);
  assert.equal(googleDocId(` https://docs.google.com/document/d/${id} `), id);
  assert.equal(googleDocId(`https://docs.google.com/spreadsheets/d/${id}/edit`), null);
  assert.equal(googleDocId(`https://evil.example/docs.google.com/document/d/${id}`), null);
  assert.equal(googleDocId(""), null);
});
