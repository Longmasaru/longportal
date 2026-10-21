import assert from "node:assert/strict";
import { test } from "node:test";
import type { BookContent } from "./content";
import { remapAnchors } from "./remap";

const heading = (chapter: number, n: number, text: string) =>
  ({ type: "heading", level: 2, id: `s${chapter}-${n}`, text }) as const;

const before: BookContent = {
  version: 1,
  chapters: [
    { title: "はじめに", blocks: [heading(1, 1, "目的")] },
    { title: "溶接の基本", blocks: [heading(2, 1, "準備"), heading(2, 2, "**安全**")] },
  ],
};

const comments = [
  { id: "c1", chapterNo: 2, chapterTitle: "溶接の基本", sectionId: "s2-2", sectionTitle: "安全" },
  { id: "c2", chapterNo: 1, chapterTitle: "はじめに", sectionId: null, sectionTitle: "" },
  { id: "c3", chapterNo: 2, chapterTitle: "溶接の基本", sectionId: "s2-1", sectionTitle: "準備" },
];

test("中身が同じなら、付け直さない", () => {
  assert.deepEqual(remapAnchors(before, comments), []);
});

test("章が足されてずれても、同じ題名の章・節に付け直す", () => {
  const after: BookContent = {
    version: 1,
    chapters: [
      { title: "はじめに", blocks: [heading(1, 1, "目的")] },
      { title: "道具", blocks: [heading(2, 1, "準備")] },
      { title: "溶接の基本", blocks: [heading(3, 1, "準備"), heading(3, 2, "服装"), heading(3, 3, "**安全**")] },
    ],
  };
  assert.deepEqual(remapAnchors(after, comments), [
    { id: "c1", chapterNo: 3, sectionId: "s3-3" },
    { id: "c3", chapterNo: 3, sectionId: "s3-1" },
  ]);
});

test("節がなくなったら章全体へのツッコミに、章がなくなったらそのままにする", () => {
  const after: BookContent = {
    version: 1,
    chapters: [
      { title: "はじめに", blocks: [heading(1, 1, "目的")] },
      { title: "溶接の基本", blocks: [heading(2, 1, "段取り"), heading(2, 2, "安全のきまり")] },
    ],
  };
  assert.deepEqual(remapAnchors(after, comments), [
    { id: "c1", chapterNo: 2, sectionId: null },
    { id: "c3", chapterNo: 2, sectionId: null },
  ]);
  const gone: BookContent = { version: 1, chapters: [{ title: "はじめに", blocks: [] }] };
  assert.deepEqual(remapAnchors(gone, [comments[0]]), [{ id: "c1", chapterNo: 2, sectionId: null }]);
});

test("同じ題名の見出しが複数あるときは、元の順番に近いものを選ぶ", () => {
  const after: BookContent = {
    version: 1,
    chapters: [
      { title: "はじめに", blocks: [] },
      {
        title: "溶接の基本",
        blocks: [heading(2, 1, "新しい節"), heading(2, 2, "準備"), heading(2, 3, "**安全**"), heading(2, 4, "準備")],
      },
    ],
  };
  assert.deepEqual(remapAnchors(after, comments), [
    { id: "c1", chapterNo: 2, sectionId: "s2-3" },
    { id: "c3", chapterNo: 2, sectionId: "s2-2" },
  ]);
});
