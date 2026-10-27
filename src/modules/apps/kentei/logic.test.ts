import assert from "node:assert/strict";
import { test } from "node:test";
import { examContentSchema, pastSets, replaceImageRefs } from "./content";
import { addAnswer, isMastered, passCount, progressOf, scoreTest, summarizeAnswers, weakIds } from "./logic";
import { toRomaji } from "./romaji";

test("答えの記録から、続けて正解した回数と最後の正誤を求める", () => {
  const stats = summarizeAnswers([
    { questionId: "a", correct: false },
    { questionId: "a", correct: true },
    { questionId: "a", correct: true },
    { questionId: "b", correct: true },
    { questionId: "b", correct: false },
  ]);
  assert.deepEqual(stats.a, { n: 3, ok: 2, streak: 2, last: true });
  assert.deepEqual(stats.b, { n: 2, ok: 1, streak: 0, last: false });
  assert.equal(isMastered(stats.a), true);
  assert.equal(isMastered(stats.b), false);
  assert.deepEqual(addAnswer(stats.b, true), {
    n: 3,
    ok: 2,
    streak: 1,
    last: true,
  });
});

test("間違えた問題と進み具合", () => {
  const stats = summarizeAnswers([
    { questionId: "a", correct: true },
    { questionId: "a", correct: true },
    { questionId: "c", correct: false },
  ]);
  assert.deepEqual(weakIds(["a", "b", "c"], stats), ["c"]);
  assert.deepEqual(progressOf(["a", "b", "c"], stats), {
    total: 3,
    answered: 2,
    mastered: 1,
    weak: 1,
    accuracy: 2 / 3,
  });
});

test("模擬テストは問題の正解で採点し、20 問中 12 問で合格(60%)", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `q${i}`);
  const answerOf = new Map(ids.map((id) => [id, true]));
  const answers = ids.map((q, i) => ({
    q,
    a: i < 12 ? true : i < 19 ? false : null,
  }));
  assert.deepEqual(scoreTest(answers, answerOf, 0.6), {
    correct: 12,
    total: 20,
    score: 60,
    passed: true,
  });
  const fail = answers.map((x, i) => (i === 0 ? { ...x, a: false } : x));
  assert.deepEqual(scoreTest(fail, answerOf, 0.6), {
    correct: 11,
    total: 20,
    score: 55,
    passed: false,
  });
  assert.equal(passCount(20, 0.6), 12);
  assert.equal(passCount(25, 0.6), 15);
});

test("ローマ字は問題用紙に近い形(助詞を分ける・促音・拗音)", () => {
  assert.equal(toRomaji("きんぞくは でんきを とおす。"), "Kinzoku wa denki o toosu.");
  assert.equal(toRomaji("しゃりんが まわる"), "Sharin ga mawaru");
  assert.equal(toRomaji("きって かいしゃ"), "Kitte kaisha");
  assert.equal(toRomaji("ちょっと"), "Chotto");
  assert.equal(toRomaji("きんいつ"), "Kin'itsu");
  assert.equal(toRomaji("プレス"), "Puresu");
});

const minimal = {
  version: 1,
  written: { count: 2, minutes: 60, passRatio: 0.6 },
  categories: [{ key: "mage", ja: "曲げ", vi: "Uốn" }],
  questions: [
    {
      id: "q1",
      category: "mage",
      answer: true,
      ja: "あ",
      sources: ["1-2"],
      image: "g1-2.png",
    },
    {
      id: "q2",
      category: "mage",
      answer: false,
      ja: "い",
      sources: ["1-1", "2-1"],
    },
  ],
  glossary: [{ kanji: "曲げ", category: "mage", questions: ["q1"] }],
};

test("中身の検査: 過去問の回ごとの並びと、画像の置き換え", () => {
  const content = examContentSchema.parse(minimal);
  assert.deepEqual(
    [...pastSets(content.questions)],
    [
      [1, ["q2", "q1"]],
      [2, ["q2"]],
    ],
  );
  const swapped = replaceImageRefs(content, new Map([["g1-2.png", "id-1"]]));
  assert.equal(swapped.questions[0].image, "id-1");
  assert.throws(() => replaceImageRefs(content, new Map()));
});

test("中身の検査: 重なる id・回と番号、ない分野、ない関連問題は通さない", () => {
  const bad = {
    ...minimal,
    questions: [...minimal.questions, { id: "q1", category: "x", answer: true, ja: "う", sources: ["1-1"] }],
    glossary: [{ kanji: "曲げ", category: "mage", questions: ["zz"] }],
  };
  const r = examContentSchema.safeParse(bad);
  assert.equal(r.success, false);
  const messages = r.error!.issues.map((i) => i.message).join("\n");
  assert.match(messages, /id が重なっています: q1/);
  assert.match(messages, /分野がありません: q1 の x/);
  assert.match(messages, /同じ回・番号が 2 つの問題にあります: 1-1/);
  assert.match(messages, /関連問題がありません: zz/);
});
