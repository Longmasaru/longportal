import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBookHtml } from "./import";
import { splitAnswer, splitQuestion } from "./quiz";

const resolve = (src: string) => (src.startsWith("img:") ? src.slice(4) : null);

test("表紙と目次を捨て、見出し 1 ごとに章に分ける", () => {
  const html = [
    "<h1>ロングの教科書</h1><h1>【ブレーキ部】</h1><p>2026年3月作成</p>",
    '<p><a href="#h1">1️⃣現場の役割分担 3</a></p><p><a href="#h2">2️⃣典型製品の例 4</a></p>',
    "<h1>1️⃣現場の役割分担</h1>",
    "<p>レーザーで切り終わった部材を<strong>図面ごと</strong>に分ける。</p><p> </p>",
    "<h2>①ワークの持ち方</h2>",
    '<p><img src="img:a" /></p>',
    "<h1></h1>",
    "<h1>2️⃣典型製品の例</h1><h3>①L曲げ</h3>",
    '<ul><li>手順<ul><li>入れ子</li></ul></li></ul><p><a href="https://example.com/v">動画</a></p>',
  ].join("");
  const r = parseBookHtml(html, resolve);
  assert.deepEqual(
    r.content.chapters.map((c) => c.title),
    ["1️⃣現場の役割分担", "2️⃣典型製品の例"],
  );
  const [c1, c2] = r.content.chapters;
  assert.deepEqual(c1.blocks[0], {
    type: "paragraph",
    inlines: [{ text: "レーザーで切り終わった部材を" }, { text: "図面ごと", bold: true }, { text: "に分ける。" }],
  });
  assert.deepEqual(c1.blocks[1], { type: "heading", level: 2, id: "s1-1", text: "①ワークの持ち方" });
  assert.deepEqual(c1.blocks[2], { type: "image", id: "a", alt: "" });
  assert.equal(c1.blocks.length, 3);
  assert.deepEqual(c2.blocks[0], { type: "heading", level: 3, id: "s2-1", text: "①L曲げ" });
  assert.deepEqual(c2.blocks[1], { type: "list", ordered: false, items: [[{ text: "手順" }], [{ text: "入れ子" }]] });
  assert.deepEqual(c2.blocks[2], { type: "paragraph", inlines: [{ text: "動画", href: "https://example.com/v" }] });
  assert.deepEqual(r.imageIds, ["a"]);
});

test("目次がなければ最初の見出し 1 から読む。表のセルの中の画像も拾う", () => {
  const html =
    "<p>表紙</p><h1>❶仕組み</h1><table><tr><td><p>画像</p></td><td><p>判定</p></td></tr>" +
    '<tr><td><p><img src="img:x" /></p></td><td><p>⭕ 正しい</p></td></tr></table>';
  const r = parseBookHtml(html, resolve);
  assert.equal(r.content.chapters.length, 1);
  const table = r.content.chapters[0].blocks[0];
  assert.equal(table.type, "table");
  if (table.type !== "table") return;
  assert.deepEqual(table.rows[1][0], [{ type: "image", id: "x", alt: "" }]);
  assert.deepEqual(r.imageIds, ["x"]);
});

test("表のセルの結合を残し、行頭の全角スペース(字下げ)を残す", () => {
  const html =
    "<h1>❶線種</h1><p>手順2)　描き込みます。</p><p>　　　　すなわち三面です。</p>" +
    '<table><tr><th rowspan="2"><p>太い実線</p></th><th><p>役割</p></th></tr>' +
    "<tr><th><p>ポイント</p></th></tr><tr><td></td><td></td></tr></table>";
  const [ch] = parseBookHtml(html, resolve).content.chapters;
  assert.deepEqual(ch.blocks[1], { type: "paragraph", inlines: [{ text: "　　　　すなわち三面です。" }] });
  const table = ch.blocks[2];
  assert.equal(table.type, "table");
  if (table.type !== "table") return;
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.spans, [{ row: 0, cell: 0, rowSpan: 2, colSpan: 1 }]);
});

test("理解度チェックテストの表をテストにする", () => {
  const html =
    "<h1>3️⃣安全教育</h1><h2>ð理解度チェックテスト</h2>" +
    "<table><tr><td><p><strong>問題（2問）</strong></p></td><td></td></tr>" +
    "<tr><td><p><strong>①</strong></p></td><td><p><strong>ボール盤の作業のルールとして正しいものはどれか。</strong>" +
    "A. 必ず軍手を着用する。 B. 絶対に軍手を使用しない。 C. 素手で作業する。</p></td></tr>" +
    "<tr><td><p>②</p></td><td><p><strong>必ず着用する保護具はどれか。</strong></p><p>A. 防塵メガネ B. 軍手 C. ヘルメット</p></td></tr></table>" +
    "<p>次の表が解答です。</p>" +
    "<table><tr><td><p>解答と解説</p></td><td></td></tr>" +
    "<tr><td><p>①</p></td><td><p><strong>B</strong> <strong>解説</strong>：巻き込まれる危険があります。</p></td></tr>" +
    "<tr><td><p>②</p></td><td><p>A 解説：粉塵が出るため。</p></td></tr></table>" +
    "<h2>次の節</h2><table><tr><td><p>ふつうの表</p></td></tr></table>";
  const r = parseBookHtml(html, resolve);
  assert.deepEqual(r.warnings, []);
  const blocks = r.content.chapters[0].blocks;
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["heading", "quiz", "paragraph", "heading", "table"],
  );
  const quiz = blocks[1];
  if (quiz.type !== "quiz") throw new Error("quiz ではありません");
  assert.deepEqual(quiz.questions[0], {
    no: "①",
    question: "ボール盤の作業のルールとして正しいものはどれか。",
    options: [
      { label: "A", text: "必ず軍手を着用する。" },
      { label: "B", text: "絶対に軍手を使用しない。" },
      { label: "C", text: "素手で作業する。" },
    ],
    answer: "B",
    explanation: "巻き込まれる危険があります。",
  });
  assert.equal(quiz.questions[1].answer, "A");
  assert.equal(quiz.questions[1].options[2].text, "ヘルメット");
});

test("解答が合わないテストは表のまま残し、注意を出す", () => {
  const html =
    "<h1>章</h1><h2>理解度チェックテスト</h2>" +
    "<table><tr><td><p>①</p></td><td><p>問題 A. あ B. い</p></td></tr></table>" +
    "<table><tr><td><p>①</p></td><td><p>C 解説：選択肢にない</p></td></tr></table>";
  const r = parseBookHtml(html, resolve);
  assert.deepEqual(
    r.content.chapters[0].blocks.map((b) => b.type),
    ["heading", "table", "table"],
  );
  assert.equal(r.warnings.length, 1);
});

test("選択肢と解答の分け方", () => {
  assert.equal(splitQuestion("選択肢のない問題"), null);
  assert.deepEqual(splitQuestion("問題？ Ａ．はい Ｂ．いいえ")?.options, [
    { label: "A", text: "はい" },
    { label: "B", text: "いいえ" },
  ]);
  assert.deepEqual(splitAnswer("Ｃ 解説：理由"), { answer: "C", explanation: "理由" });
  assert.equal(splitAnswer("解説だけ"), null);
});
