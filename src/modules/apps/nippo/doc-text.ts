import { FIELD_DEF, TEXT_FIELDS, type TextField } from "./labels";
import { parseJaDate } from "./import";
import type { ReportFields } from "./logic";

// 日報 1 件を、Google ドキュメント「日報まとめ」の今の様式の文章にする(ドキュメントへの自動の書き込み。docs/DESIGN.md 43 章)。
// 書き込んだドキュメントを `parseNippoDocument` で読み直しても、同じ項目に戻る形にしている。

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

// --- ドキュメントへの自動の書き込み(docs/DESIGN.md 43 章)。ドキュメントは 1 日 1 タブで、タブの名前は「【日報】10月21日（水）」の形。

/** タブの名前から、その日の日付(YYYY-MM-DD)を読む。「【日報】」で始まらないタブは日報のタブとみなさない。 */
export function tabReportDate(title: string, defaultYear: number): string | null {
  if (!title.trim().startsWith("【日報】")) return null;
  return parseJaDate(title, defaultYear);
}

/** その日の日報のタブ(なければ null)。 */
export function findReportTab<T extends { title: string }>(tabs: T[], reportDate: string): T | null {
  const year = Number(reportDate.slice(0, 4));
  return tabs.find((t) => tabReportDate(t.title, year) === reportDate) ?? null;
}

/** 新しく足すタブの名前。ドキュメントの最後の日報のタブが年つき(「2026年6月22日」)なら、年をつける。 */
export function newTabTitle(reportDate: string, existingTitles: string[]): string {
  const [y, m, d] = reportDate.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const last = existingTitles.filter((t) => t.trim().startsWith("【日報】")).at(-1);
  const withYear = last ? /\d{4}\s*年/.test(last) : false;
  return `【日報】${withYear ? `${y}年` : ""}${m}月${d}日（${weekday}）`;
}

/**
 * 社員番号 → ドキュメントの ID の対応(環境変数 NIPPO_GOOGLE_DOCS の JSON。値はドキュメントの URL でもよい)。
 * 読めない値は捨てる(書き込まないだけで、日報の操作は止めない)。
 */
export function parseDocMap(json: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!json?.trim()) return map;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return map;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return map;
  for (const [number, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    const id = /\/document\/d\/([\w-]+)/.exec(value)?.[1] ?? value.trim();
    if (/^[\w-]{20,}$/.test(id)) map.set(number.trim(), id);
  }
  return map;
}
