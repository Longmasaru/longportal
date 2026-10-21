import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { missingFields, needsResponder, postAccess, unreadForAuthor } from "./constants";

const AUTHOR = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

describe("目安箱の入力チェック", () => {
  it("カテゴリと公開範囲は必ず選ぶ", () => {
    assert.deepEqual(missingFields({ category: null, visibility: undefined, body: "床が滑る", photoCount: 0 }), [
      "category",
      "visibility",
    ]);
    assert.deepEqual(missingFields({ category: "hazard", visibility: "private", body: "床が滑る", photoCount: 0 }), []);
  });

  it("知らない値は選ばれていない扱い", () => {
    assert.deepEqual(missingFields({ category: "x", visibility: "everyone", body: "a", photoCount: 0 }), [
      "category",
      "visibility",
    ]);
  });

  it("内容は文章か写真のどちらかがあればよい", () => {
    assert.deepEqual(missingFields({ category: "want", visibility: "public", body: "  ", photoCount: 0 }), ["content"]);
    assert.deepEqual(missingFields({ category: "want", visibility: "public", body: "", photoCount: 1 }), []);
  });
});

describe("目安箱の見え方", () => {
  const privatePost = { authorUserId: AUTHOR, visibility: "private" as const, anonymous: false };
  const publicAnon = { authorUserId: AUTHOR, visibility: "public" as const, anonymous: true };

  it("管理者だけの投稿は、本人と返事ができる人だけが見られる", () => {
    assert.equal(postAccess(privatePost, AUTHOR, false).view, true);
    assert.equal(postAccess(privatePost, OTHER, false).view, false);
    assert.equal(postAccess(privatePost, OTHER, true).view, true);
  });

  it("公開の投稿は誰でも見られるが、書き込めるのは本人と返事ができる人だけ", () => {
    const other = postAccess(publicAnon, OTHER, false);
    assert.equal(other.view, true);
    assert.equal(other.message, false);
    assert.equal(postAccess(publicAnon, AUTHOR, false).message, true);
    assert.equal(postAccess(publicAnon, OTHER, true).message, true);
  });

  it("匿名の投稿は、管理する人にも名前を出さない(本人には出す)", () => {
    assert.equal(postAccess(publicAnon, OTHER, true).showAuthor, false);
    assert.equal(postAccess(publicAnon, AUTHOR, false).showAuthor, true);
    assert.equal(postAccess(privatePost, OTHER, true).showAuthor, true);
  });
});

describe("目安箱の未読", () => {
  const t = (s: string) => new Date(`2026-10-21T${s}:00+09:00`);

  it("未読のままの投稿と、投稿者の書き足しは、返事をする側の要対応", () => {
    assert.equal(needsResponder({ status: "new", authorActivityAt: null, responderReadAt: null }), true);
    assert.equal(needsResponder({ status: "doing", authorActivityAt: null, responderReadAt: t("10:00") }), false);
    assert.equal(needsResponder({ status: "doing", authorActivityAt: t("11:00"), responderReadAt: t("10:00") }), true);
    assert.equal(needsResponder({ status: "doing", authorActivityAt: t("09:00"), responderReadAt: t("10:00") }), false);
  });

  it("返事・状況の変化を、投稿者がまだ読んでいない", () => {
    assert.equal(unreadForAuthor({ responderActivityAt: null, authorReadAt: null }), false);
    assert.equal(unreadForAuthor({ responderActivityAt: t("10:00"), authorReadAt: null }), true);
    assert.equal(unreadForAuthor({ responderActivityAt: t("10:00"), authorReadAt: t("11:00") }), false);
  });
});
