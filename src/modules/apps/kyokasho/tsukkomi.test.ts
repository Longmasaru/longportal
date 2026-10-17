import assert from "node:assert/strict";
import { test } from "node:test";
import { canDeleteOwnComment, isAdopted, isCommentKind, isCommentStatus, rankContributors } from "./tsukkomi";

test("ツッコミの種類・受け止め方の判定", () => {
  assert.equal(isCommentKind("question"), true);
  assert.equal(isCommentKind("other"), false);
  assert.equal(isCommentStatus("reflected"), true);
  assert.equal(isCommentStatus("declined"), false);
  assert.equal(isAdopted("adopted"), true);
  assert.equal(isAdopted("reflected"), true);
  assert.equal(isAdopted("kept"), false);
  assert.equal(isAdopted("open"), false);
});

test("教科書をよくしてくれた人: 採用の数 → ツッコミの数 → 名前の順。書いた人が消えたものは数えない", () => {
  const ranked = rankContributors([
    { authorUserId: "u1", authorName: "山田", status: "open" },
    { authorUserId: "u1", authorName: "山田", status: "kept" },
    { authorUserId: "u1", authorName: "山田", status: "open" },
    { authorUserId: "u2", authorName: "佐藤", status: "reflected" },
    { authorUserId: "u3", authorName: "伊藤", status: "adopted" },
    { authorUserId: "u3", authorName: "伊藤", status: "open" },
    { authorUserId: null, authorName: null, status: "reflected" },
  ]);
  assert.deepEqual(
    ranked.map((c) => [c.userId, c.count, c.adopted]),
    [
      ["u3", 2, 1],
      ["u2", 1, 1],
      ["u1", 3, 0],
    ],
  );
});

test("本人が消せるのは、返事のついていない、まだ見ていない自分のツッコミだけ", () => {
  assert.equal(canDeleteOwnComment({ authorUserId: "u1", status: "open", reply: "" }, "u1"), true);
  assert.equal(canDeleteOwnComment({ authorUserId: "u1", status: "open", reply: "" }, "u2"), false);
  assert.equal(canDeleteOwnComment({ authorUserId: "u1", status: "adopted", reply: "" }, "u1"), false);
  assert.equal(canDeleteOwnComment({ authorUserId: "u1", status: "open", reply: "ありがとう" }, "u1"), false);
  assert.equal(canDeleteOwnComment({ authorUserId: null, status: "open", reply: "" }, "u1"), false);
});
