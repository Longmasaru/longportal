import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findReportTab, newTabTitle, parseDocMap, reportToDocText, tabReportDate } from "./doc-text";
import { parseNippoDocument } from "./import";
import { emptyFields } from "./logic";

const report = {
  ...emptyFields(),
  training: "・図面の作成",
  topLearning: "データ作成の手順",
  taught: "・寸法線をずらす。",
  asked: "・Q：中心点だけでよいか？\nA：よい。",
  canDo: "類似データを真似できた。",
  tomorrow: "・つづき",
  score: 6,
  scoreNote: "少し疲れた。",
  employeeName: "zz 花子",
  reportDate: "2026-10-21",
  reviewerComments: ["いいですね。", "次はここも。"],
};

describe("reportToDocText", () => {
  it("ドキュメントの様式の見出しと順番で書く", () => {
    const text = reportToDocText(report);
    assert.ok(text.startsWith("【日報】10月21日（水）\n氏名\n\tzz 花子\n日付\n\t2026年10月21日\n1. 今日の研修内容\n・図面の作成\n"));
    assert.ok(text.includes("\n5. まだ分からないこと\n\n6. コンディション\n今日の点数\n\t6/10\n少し疲れた。\n7. 明日の予定\n"));
    assert.ok(text.endsWith("8. 指導者からのフィードバック（※指導者記入欄）\nいいですね。\n次はここも。\n"));
    // 書かれていない小見出しは出さない。
    assert.ok(!text.includes("自分で気づいたこと"));
  });

  it("貼ったドキュメントを取り込み直すと、同じ項目に戻る", () => {
    const [back] = parseNippoDocument(reportToDocText(report), 2026).reports;
    assert.equal(back.reportDate, "2026-10-21");
    assert.equal(back.name, "zz花子");
    for (const k of ["training", "topLearning", "taught", "asked", "canDo", "tomorrow", "score", "scoreNote"] as const) {
      assert.equal(back.fields[k], report[k], k);
    }
    assert.equal(back.feedback, "いいですね。\n次はここも。");
  });
});

describe("ドキュメントのタブ", () => {
  it("タブの名前から日付を読む(年なしは日報の年、「【日報】」で始まらないタブは読まない)", () => {
    assert.equal(tabReportDate("【日報】10月21日（水）", 2026), "2026-10-21");
    assert.equal(tabReportDate("【日報】2026年6月22日（月）", 2027), "2026-06-22");
    assert.equal(tabReportDate("メモ 10月21日", 2026), null);
  });

  it("その日のタブを探す", () => {
    const tabs = [
      { tabId: "a", title: "【日報】10月20日（火）" },
      { tabId: "b", title: "【日報】10月21日（水）" },
    ];
    assert.equal(findReportTab(tabs, "2026-10-21")?.tabId, "b");
    assert.equal(findReportTab(tabs, "2026-10-22"), null);
  });

  it("新しいタブの名前は、最後の日報のタブに合わせて年をつける", () => {
    assert.equal(newTabTitle("2026-10-22", ["【日報】10月21日（水）"]), "【日報】10月22日（木）");
    assert.equal(newTabTitle("2026-10-22", ["【日報】2026年10月21日（水）", "メモ"]), "【日報】2026年10月22日（木）");
    assert.equal(newTabTitle("2026-10-22", []), "【日報】10月22日（木）");
  });

  it("社員番号 → ドキュメントの対応を読む(URL も可。読めない値は捨てる)", () => {
    const map = parseDocMap(
      JSON.stringify({
        "0052": "https://docs.google.com/document/d/1djebTYRj8pyErwioj9WoIuRNMTUitPlY72eVa7TzaR4/edit?usp=sharing",
        "0053": "1NYzFf9RPYIBjUJ2hayx2tA0Lftj0blile8mAgNIFFC4",
        "0054": "abc",
        "0055": 1,
      }),
    );
    assert.deepEqual([...map], [
      ["0052", "1djebTYRj8pyErwioj9WoIuRNMTUitPlY72eVa7TzaR4"],
      ["0053", "1NYzFf9RPYIBjUJ2hayx2tA0Lftj0blile8mAgNIFFC4"],
    ]);
    assert.equal(parseDocMap("{").size, 0);
    assert.equal(parseDocMap(undefined).size, 0);
  });
});
