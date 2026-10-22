import { FIELD_DEF, TEXT_FIELDS, type TextField } from "./labels";
import type { ReportFields } from "./logic";

// 日報 1 件を、Google ドキュメント「日報まとめ」の今の様式の文章にする(画面の「ドキュメント用にコピー」。docs/DESIGN.md 39 章)。
// 貼ったドキュメントを `parseNippoDocument` で読み直しても、同じ項目に戻る形にしている。

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 2. の章の中の小見出し(ドキュメントの様式の名前)。 */
const SUB_LABEL: Partial<Record<TextField, string>> = {
  topLearning: "今日一番の学び",
  taught: "指導で教わったこと",
  asked: "質問して分かったこと",
  noticed: "自分で気づいたこと",
};

export type DocTextInput = ReportFields & {
  employeeName: string;
  /** YYYY-MM-DD */
  reportDate: string;
  /** 指導者(本人以外)のコメントの本文。古い順。 */
  reviewerComments: string[];
};

export function reportToDocText(r: DocTextInput): string {
  const [y, m, d] = r.reportDate.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const lines = [`【日報】${m}月${d}日（${weekday}）`, "氏名", `\t${r.employeeName}`, "日付", `\t${y}年${m}月${d}日`];
  let section = "";
  for (const f of TEXT_FIELDS) {
    const def = FIELD_DEF[f];
    if (def.section !== section) {
      section = def.section;
      // コンディション(6.)は文章の項目にないので、5. と 7. の間に入れる。
      if (section.startsWith("7.")) lines.push(...conditionLines(r));
      lines.push(section);
    }
    const sub = SUB_LABEL[f];
    if (sub) {
      if (r[f].trim()) lines.push(sub, r[f].trim());
    } else lines.push(r[f].trim());
  }
  lines.push("8. 指導者からのフィードバック（※指導者記入欄）", ...r.reviewerComments.map((c) => c.trim()));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

function conditionLines(r: DocTextInput): string[] {
  const lines = ["6. コンディション"];
  if (r.score != null) lines.push("今日の点数", `\t${r.score}/10`);
  if (r.scoreNote.trim()) lines.push(r.scoreNote.trim());
  return lines;
}
