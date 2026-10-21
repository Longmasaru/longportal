import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJaDate, parseNippoDocument } from "./import";

// 実物の様式を写した、架空の内容の見本(3 通りの様式)。
const JUNE = [
  "【日報】2026年6月22日（月）",
  "【日報】6月22日（月） ",
  "氏名",
  "\tzz 花子",
  "\t日付",
  "\t2026年6月22日",
  "\t",
  "",
  "1. 当日の業務スケジュール",
  "時間",
  "\t作業内容",
  " ",
  "\t08:30 - 09:00",
  "\t朝礼",
  "\t09:00 - 11:20",
  "\t図面講習",
  "",
  "2. 本日のできた成果（★必ず何か1つ記入する）",
  "* メモを取り終えた。",
  "3. 本日の気づき・学んだこと",
  "* 工程の流れを学んだ。",
  "4. 不明点・相談したいこと",
  "* 曲げの順番。",
  "5. 本日のコンディション",
  "いっぱいいっぱい度",
  "\t★★★★☆ （星5つが限界）",
  "\tその理由・一言",
  "\t覚えることが多かった。",
  "6. 明日の予定・タスク",
  "* 見学",
  "7. 指導者からのフィードバック（※指導者記入欄）",
  "（指導者や先輩社員に記入してもらうスペースです）",
  "お疲れ様です！",
  "復習しましょう。",
  "\t",
  "8. 日報を踏まえて（相談済み）",
  "* ゆっくり教えてほしい。",
  "",
].join("\r\n");

const AUGUST = [
  "【日報】8月6日（木）",
  "【日報】8月6日（木）",
  "氏名",
  "\tzz 花子",
  "\t日付",
  "\t2026年08月06日",
  "\t1. 本日の気づき・学んだこと（★必ず何か1つ記入する）",
  "* 類似検索の使い方",
  "\t2. 不明点・相談したいこと",
  "特になし",
  "\t3. 本日のコンディション",
  "いっぱいいっぱい度",
  "\t8/10",
  "\tその理由・一言",
  "\tスムーズにできた。",
  "\t4. 難しかったこと・備忘録（覚えておきたいこと）",
  "* シート編集に戻る。",
  "\t5. 今後の予定・タスク",
  "* 割り付けの続き",
  "\t6. 指導者からのフィードバック（※指導者記入欄）",
  "（指導者や先輩社員に記入してもらうスペースです）",
  "",
].join("\n");

const OCTOBER = [
  "【日報】10月21日（水）",
  "【日報】10月21日（水）",
  "氏名",
  "\tzz 花子",
  "\t日付",
  "\t2026年10月21日",
  "\t1. 今日の研修内容",
  "               * 図面の作成",
  "\t2. 教わったこと・学んだこと",
  "今日一番の学び",
  "\tデータ作成の手順",
  "\t指導で教わったこと",
  "\t               * 寸法線をずらす。",
  "\t質問して分かったこと",
  "\t               * Q：中心点だけでよいか？",
  "A：よい。",
  "\t3. 前よりうまくできたこと",
  "類似データを真似できた。",
  "\t4. 難しかったこと",
  "機械の理解。",
  "\t5. まだ分からないこと",
  "                  * 部品の正体",
  "\t6. コンディション",
  "今日の点数",
  "\t6/10",
  "\t7. 明日の予定",
  "● つづき",
  "\t8. 指導者からのフィードバック（※指導者記入欄）",
  "（指導者や先輩社員に記入してもらうスペースです）",
  "いいですね。",
].join("\n");

describe("parseJaDate", () => {
  it("年つき・年なしの日付を読む", () => {
    assert.equal(parseJaDate("2026年6月22日", 2026), "2026-06-22");
    assert.equal(parseJaDate("【日報】8月5日（水）", 2026), "2026-08-05");
    assert.equal(parseJaDate("2026年02月30日", 2026), null);
    assert.equal(parseJaDate("日付なし", 2026), null);
  });
});

describe("parseNippoDocument", () => {
  it("2 行続く見出しを 1 日分とみなし、3 通りの様式を読む", () => {
    const { reports, skipped } = parseNippoDocument(`﻿${JUNE}\n${AUGUST}\n${OCTOBER}`, 2026);
    assert.equal(skipped, 0);
    assert.deepEqual(
      reports.map((r) => r.reportDate),
      ["2026-06-22", "2026-08-06", "2026-10-21"],
    );
    assert.ok(reports.every((r) => r.name === "zz花子"));
  });

  it("6 月の様式: 時間割を 1 行にまとめ、いっぱいいっぱい度は点数にせず一言に入れる", () => {
    const [r] = parseNippoDocument(JUNE, 2026).reports;
    assert.equal(r.fields.training, "・08:30-09:00 朝礼\n・09:00-11:20 図面講習");
    assert.equal(r.fields.canDo, "・メモを取り終えた。");
    assert.equal(r.fields.taught, "・工程の流れを学んだ。");
    assert.equal(r.fields.unclear, "・曲げの順番。");
    assert.equal(r.fields.tomorrow, "・見学");
    assert.equal(r.fields.score, null);
    assert.equal(r.fields.scoreNote, "いっぱいいっぱい度 ★★★★☆ （星5つが限界）\n覚えることが多かった。");
    assert.equal(r.feedback, "お疲れ様です！\n復習しましょう。");
    assert.deepEqual(r.unknownHeadings, ["日報を踏まえて"]);
    assert.equal(r.fields.noticed, "【日報を踏まえて】\n・ゆっくり教えてほしい。");
  });

  it("8 月の様式: 研修内容は空、フィードバックが空ならコメントなし", () => {
    const [r] = parseNippoDocument(AUGUST, 2026).reports;
    assert.equal(r.fields.training, "");
    assert.equal(r.fields.taught, "・類似検索の使い方");
    assert.equal(r.fields.unclear, "特になし");
    assert.equal(r.fields.difficult, "・シート編集に戻る。");
    assert.equal(r.fields.tomorrow, "・割り付けの続き");
    assert.equal(r.fields.score, null);
    assert.equal(r.fields.scoreNote, "いっぱいいっぱい度 8/10\nスムーズにできた。");
    assert.equal(r.feedback, null);
  });

  it("10 月の様式: 小見出しを項目に分け、今日の点数を点数にする", () => {
    const [r] = parseNippoDocument(OCTOBER, 2026).reports;
    assert.equal(r.fields.training, "・図面の作成");
    assert.equal(r.fields.topLearning, "データ作成の手順");
    assert.equal(r.fields.taught, "・寸法線をずらす。");
    assert.equal(r.fields.asked, "・Q：中心点だけでよいか？\nA：よい。");
    assert.equal(r.fields.canDo, "類似データを真似できた。");
    assert.equal(r.fields.difficult, "機械の理解。");
    assert.equal(r.fields.unclear, "・部品の正体");
    assert.equal(r.fields.tomorrow, "・つづき");
    assert.equal(r.fields.score, 6);
    assert.equal(r.fields.scoreNote, "");
    assert.equal(r.feedback, "いいですね。");
  });

  it("書き間違いの点数は点数にせず、一言に残す", () => {
    const [r] = parseNippoDocument(OCTOBER.replace("\t6/10", "\t28/10"), 2026).reports;
    assert.equal(r.fields.score, null);
    assert.equal(r.fields.scoreNote, "今日の点数 28/10");
  });
});
