import assert from "node:assert/strict";
import { test } from "node:test";
import { isNoticeAddressedTo, isNoticeBanner, isNoticeLive, summarize, type NoticeFacts } from "./logic";

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
