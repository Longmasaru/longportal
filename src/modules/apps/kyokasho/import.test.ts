import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { importGoogleZip, parseBookHtml, readZip } from "./import";
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

/** テスト用の zip を作る(1 つ目は保存、2 つ目以降は deflate)。 */
function makeZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  Object.entries(files).forEach(([name, text], i) => {
    const raw = Buffer.from(text, "utf8");
    const method = i === 0 ? 0 : 8;
    const data = method === 0 ? raw : deflateRawSync(raw);
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  });
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test("zip を読む(保存と deflate)", () => {
  const files = readZip(makeZip({ "a.txt": "あいう", "dir/b.txt": "かきく" }));
  assert.equal(files.get("a.txt")?.toString("utf8"), "あいう");
  assert.equal(files.get("dir/b.txt")?.toString("utf8"), "かきく");
});

test("Google ドキュメントのウェブページ書き出しを読む(太字・転送 URL・コメント・字下げ)", async () => {
  const html =
    '<html><head><style>.c1{}</style></head><body><h1>1️⃣図面<sup><a href="#cmnt1" id="cmnt_ref1">[a]</a></sup></h1>' +
    '<p><span style="font-weight:700">≪ルール≫</span></p>' +
    "<p><span>手順2) 描き込みます。</span></p><p><span>&nbsp; &nbsp; すなわち三面です。</span></p>" +
    '<p><a href="https://www.google.com/url?q=https://www.long-kanazawa.com/machines/&amp;sa=D">設備</a></p>' +
    '<div><p><a href="#cmnt_ref1" id="cmnt1">[a]</a>要確認</p></div></body></html>';
  const { content, warnings } = await importGoogleZip(makeZip({ "index.html": html }));
  assert.deepEqual(warnings, []);
  const [ch] = content.chapters;
  assert.equal(ch.title, "1️⃣図面");
  assert.deepEqual(ch.blocks, [
    { type: "paragraph", inlines: [{ text: "≪ルール≫", bold: true }] },
    { type: "paragraph", inlines: [{ text: "手順2) 描き込みます。" }] },
    { type: "paragraph", inlines: [{ text: "\u3000\u3000\u3000\u3000すなわち三面です。" }] },
    { type: "paragraph", inlines: [{ text: "設備", href: "https://www.long-kanazawa.com/machines/" }] },
  ]);
});
