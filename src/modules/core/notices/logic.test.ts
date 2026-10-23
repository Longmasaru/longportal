import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatFileSize,
  isAllowedNoticeAttachment,
  isInlineNoticeImage,
  isNoticeAddressedTo,
  isNoticeBanner,
  isNoticeLive,
  splitBodyLinks,
  summarize,
  type NoticeFacts,
} from "./logic";

const TODAY = "2026-10-15";
const base: NoticeFacts = {
  status: "published",
  target: "company",
  priority: "normal",
  audienceId: null,
  publishedOn: "2026-10-01",
  expiresOn: null,
  bannerUntil: null,
};

test("isNoticeLive: 公開済みで掲載期間内だけ", () => {
  assert.equal(isNoticeLive(base, TODAY), true);
  assert.equal(isNoticeLive({ ...base, status: "draft" }, TODAY), false);
  assert.equal(isNoticeLive({ ...base, publishedOn: "2026-10-16" }, TODAY), false);
  assert.equal(isNoticeLive({ ...base, expiresOn: "2026-10-15" }, TODAY), true);
  assert.equal(isNoticeLive({ ...base, expiresOn: "2026-10-14" }, TODAY), false);
});

test("isNoticeAddressedTo: 宛先ごとの判定(deny by default)", () => {
  const viewer = { employeeId: "e1", matchedAudienceIds: new Set(["a1"]) };
  const noEmployee = { employeeId: null, matchedAudienceIds: new Set<string>() };
  assert.equal(isNoticeAddressedTo({ target: "company", audienceId: null }, noEmployee, new Set()), true);
  assert.equal(isNoticeAddressedTo({ target: "audience", audienceId: "a1" }, viewer, new Set()), true);
  assert.equal(isNoticeAddressedTo({ target: "audience", audienceId: "a2" }, viewer, new Set()), false);
  assert.equal(isNoticeAddressedTo({ target: "audience", audienceId: null }, viewer, new Set()), false);
  assert.equal(isNoticeAddressedTo({ target: "individual", audienceId: null }, viewer, new Set(["e1"])), true);
  assert.equal(isNoticeAddressedTo({ target: "individual", audienceId: null }, viewer, new Set(["e2"])), false);
  assert.equal(isNoticeAddressedTo({ target: "individual", audienceId: null }, noEmployee, new Set(["e1"])), false);
});

test("isNoticeBanner: 全社宛・緊急・バナーの最終日まで・掲載中", () => {
  const urgent = { ...base, priority: "urgent" as const, bannerUntil: "2026-10-15" };
  assert.equal(isNoticeBanner(urgent, TODAY), true);
  assert.equal(isNoticeBanner({ ...urgent, bannerUntil: "2026-10-14" }, TODAY), false);
  assert.equal(isNoticeBanner({ ...urgent, priority: "important" }, TODAY), false);
  assert.equal(isNoticeBanner({ ...urgent, target: "audience", audienceId: "a1" }, TODAY), false);
  assert.equal(isNoticeBanner({ ...urgent, status: "draft" }, TODAY), false);
});

test("summarize: 改行をまとめ、長ければ省略", () => {
  assert.equal(summarize("1行目\n\n2行目"), "1行目 2行目");
  assert.equal(summarize("あ".repeat(100), 10), `${"あ".repeat(10)}…`);
});

test("splitBodyLinks: 本文の URL をリンクに分け、文末の句読点やかっこは含めない", () => {
  assert.deepEqual(splitBodyLinks("資料はこちら\n▶ https://board.example.com/a?t=1&b=my&x=false"), [
    { type: "text", text: "資料はこちら\n▶ " },
    { type: "link", url: "https://board.example.com/a?t=1&b=my&x=false" },
  ]);
  assert.deepEqual(splitBodyLinks("見てください(https://example.com/x)。"), [
    { type: "text", text: "見てください(" },
    { type: "link", url: "https://example.com/x" },
    { type: "text", text: ")。" },
  ]);
  assert.deepEqual(splitBodyLinks("URL なし"), [{ type: "text", text: "URL なし" }]);
  // javascript: などは URL として扱わない
  assert.deepEqual(splitBodyLinks("javascript:alert(1)"), [{ type: "text", text: "javascript:alert(1)" }]);
});

test("添付: 付けられるファイルは拡張子で判断する(大文字も可)", () => {
  assert.equal(isAllowedNoticeAttachment("チラシ.PDF"), true);
  assert.equal(isAllowedNoticeAttachment("写真.jpeg"), true);
  assert.equal(isAllowedNoticeAttachment("表.xlsx"), true);
  assert.equal(isAllowedNoticeAttachment("page.html"), false);
  assert.equal(isAllowedNoticeAttachment("tool.exe"), false);
  assert.equal(isAllowedNoticeAttachment("拡張子なし"), false);
  assert.equal(isAllowedNoticeAttachment("pdf"), false);
});

test("添付: そのまま表示するのは一般的な画像だけ", () => {
  assert.equal(isInlineNoticeImage("image/jpeg"), true);
  assert.equal(isInlineNoticeImage("image/png"), true);
  assert.equal(isInlineNoticeImage("image/svg+xml"), false);
  assert.equal(isInlineNoticeImage("image/heic"), false);
  assert.equal(isInlineNoticeImage("application/pdf"), false);
});

test("添付: 大きさの表示", () => {
  assert.equal(formatFileSize(100), "1KB");
  assert.equal(formatFileSize(350 * 1024), "350KB");
  assert.equal(formatFileSize(1.25 * 1024 * 1024), "1.3MB");
});
