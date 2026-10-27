import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canDeleteOwnComment,
  googleCommentContent,
  googleCommentMarker,
  isAdopted,
  isCommentKind,
  isCommentStatus,
  notifyChannelFor,
  rankContributors,
} from "./tsukkomi";

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

test("知らせの送り先: 教科書の slug → 部署 → なければ全体用", () => {
  const env = {
    KYOKASHO_LINEWORKS_CHANNELS: JSON.stringify({ stud: "ch-stud", ブレーキ部: " ch-brake ", 技術部: "ch-tech" }),
    KYOKASHO_LINEWORKS_CHANNEL_ID: "ch-all",
  };
  assert.equal(notifyChannelFor({ slug: "stud", department: "ブレーキ部" }, env), "ch-stud");
  assert.equal(notifyChannelFor({ slug: "shokyu", department: "ブレーキ部" }, env), "ch-brake");
  assert.equal(notifyChannelFor({ slug: "kyotsu", department: "全部署共通" }, env), "ch-all");
  const broken = { KYOKASHO_LINEWORKS_CHANNELS: "壊れた値", KYOKASHO_LINEWORKS_CHANNEL_ID: "ch-all" };
  assert.equal(notifyChannelFor({ slug: "stud", department: "ブレーキ部" }, broken), "ch-all");
  assert.equal(notifyChannelFor({ slug: "stud", department: "ブレーキ部" }, {}), undefined);
});

test("Google ドキュメントのコメント: 種類・場所・本文・書いた人・道と、二重防止の印を入れる", () => {
  const text = googleCommentContent({
    id: "0123abcd-0000-4000-8000-000000000000",
    kind: "question",
    chapterTitle: "第1章 ブレーキ部の仕事",
    sectionTitle: "1-2 一日の流れ",
    body: "何を確認すればよいですか?",
    authorName: "伊藤 健",
    url: "https://long-ishikawa.com/apps/kyokasho/shokyu/1",
  });
  assert.match(text, /^【はてな】第1章 ブレーキ部の仕事 › 1-2 一日の流れ\n\n何を確認すればよいですか\?/);
  assert.match(text, /伊藤 健 さん/);
  assert.ok(text.endsWith(`https://long-ishikawa.com/apps/kyokasho/shokyu/1\n${googleCommentMarker("0123abcd-0000-4000-8000-000000000000")}`));
  assert.equal(googleCommentMarker("0123abcd-0000"), "ツッコミ番号 0123abcd");
});
