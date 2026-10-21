import { FIELD_MAX, SCORE_NOTE_MAX, type TextField } from "./labels";
import { emptyFields, type ReportFields } from "./logic";

// Google ドキュメントの「日報まとめ」(テキストで保存したもの)を、1 日ずつの日報に分ける(DB に依存しない純粋関数)。
// docs/DESIGN.md 39 章。様式は時期によって 3 通りある(6 月〜の時間割つき、8 月〜の 6 章、10 月〜の今の様式)。

export type ParsedReport = {
  /** YYYY-MM-DD */
  reportDate: string;
  /** 「氏名」の欄(空白を除いたもの)。取り込み先の社員との照合に使う。 */
  name: string;
  fields: ReportFields;
  /** 指導者からのフィードバック。空なら null。 */
  feedback: string | null;
  /** 読み取れなかった見出し(本文として「自分で気づいたこと」の後ろに残す) */
  unknownHeadings: string[];
};

type Target = TextField | "condition" | "feedback";

/** 章の見出し(番号を除き、括弧の注記を除いたもの)→ 入れる先。前から順に当てる。 */
const HEADINGS: [RegExp, Target][] = [
  [/^(当日の業務スケジュール|今日の研修内容)/, "training"],
  [/^本日の(で)?できた成果/, "canDo"],
  [/^(一人でできるようになったこと|前よりうまくできたこと)/, "canDo"],
  [/^教わったこと・学んだこと/, "taught"],
  [/^本日の気づき・学んだこと/, "taught"],
  [/^(不明点・相談したいこと|まだ分からないこと)/, "unclear"],
  [/^(難しかったこと|備忘録)/, "difficult"],
  [/^(本日の)?コンディション/, "condition"],
  [/^(今後の予定|明日の予定)/, "tomorrow"],
  [/^指導者からのフィードバック/, "feedback"],
];

/** 今の様式の「2. 教わったこと・学んだこと」の中の小見出し。 */
const SUB_HEADINGS: Record<string, TextField> = {
  今日一番の学び: "topLearning",
  指導で教わったこと: "taught",
  質問して分かったこと: "asked",
  自分で気づいたこと: "noticed",
};

const REPORT_START = /^【日報】/;
const SECTION = /^([1-9])[.．]\s*(.+)$/;
const TIME_RANGE = /^(\d{1,2}:\d{2})\s*[-–~〜]\s*(\d{1,2}:\d{2})$/;
const PLACEHOLDER = /^[（(]指導者や先輩社員に記入してもらうスペースです[）)]$/;

function stripNote(heading: string): string {
  return heading.replace(/[（(].*$/, "").trim();
}

/** 見出しのない日報の日付(「2026年6月22日」「8月5日」)を YYYY-MM-DD に。 */
export function parseJaDate(text: string, defaultYear: number): string | null {
  const m = /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(text);
  if (!m) return null;
  const year = m[1] ? Number(m[1]) : defaultYear;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 1 行を整える(前後の空白・タブを除き、箇条書きの印を「・」にそろえる)。 */
function cleanLine(line: string): string {
  return line
    .replace(/[ 　]/g, " ")
    .trim()
    .replace(/^[*●•・]\s*/, "・");
}

/** 行の並びを文章に(前後の空行を除き、続く空行は 1 つに)。 */
function joinLines(lines: string[]): string {
  const out: string[] = [];
  for (const l of lines) {
    if (!l && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(l);
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/** 6 月〜の様式の時間割(「時間」「作業内容」の表)を「・08:30-09:00 朝礼」の形に。 */
function scheduleLines(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l === "時間" || l === "作業内容") continue;
    const t = TIME_RANGE.exec(l);
    if (t) {
      let j = i + 1;
      while (j < lines.length && !lines[j]) j++;
      const what = j < lines.length && !TIME_RANGE.test(lines[j]) ? lines[j] : "";
      out.push(`・${t[1]}-${t[2]} ${what}`.trimEnd());
      if (what) i = j;
      continue;
    }
    out.push(l);
  }
  return out;
}

/** コンディションの章。「今日の点数 6/10」だけを点数にし、ほか(いっぱいいっぱい度など)は一言に入れる。 */
function parseCondition(lines: string[]): { score: number | null; note: string } {
  let score: number | null = null;
  const parts: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (l === "今日の点数") {
      const m = /^(\d{1,2})\s*\/\s*10/.exec(lines[i + 1] ?? "");
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= 10) {
        score = Number(m[1]);
        i++;
        continue;
      }
      // 「28/10」のような書き間違いは点数にせず、そのまま一言に残す。
      if (lines[i + 1]) {
        parts.push(`今日の点数 ${lines[i + 1]}`);
        i++;
        continue;
      }
    }
    if (l === "その理由・一言") continue;
    if (l === "いっぱいいっぱい度" && lines[i + 1]) {
      parts.push(`いっぱいいっぱい度 ${lines[i + 1]}`);
      i++;
      continue;
    }
    parts.push(l);
  }
  return { score, note: parts.join("\n") };
}

function append(fields: ReportFields, field: TextField, text: string): void {
  if (!text) return;
  fields[field] = fields[field] ? `${fields[field]}\n${text}` : text;
}

/** 1 日分の本文を読む。日付が読めなければ null。 */
function parseOne(lines: string[], defaultYear: number): ParsedReport | null {
  const header = lines[0] ?? "";
  let name = "";
  let dateText = "";
  const sections: { heading: string; lines: string[] }[] = [];
  let preamble = true;
  for (let i = 1; i < lines.length; i++) {
    const l = cleanLine(lines[i]);
    const s = SECTION.exec(l);
    if (s && (HEADINGS.some(([re]) => re.test(stripNote(s[2]))) || /^日報を踏まえて/.test(s[2]))) {
      sections.push({ heading: stripNote(s[2]), lines: [] });
      preamble = false;
      continue;
    }
    if (preamble) {
      if (l === "氏名") name = cleanLine(lines[i + 1] ?? "").replace(/\s/g, "");
      if (l === "日付") dateText = cleanLine(lines[i + 1] ?? "");
      continue;
    }
    sections[sections.length - 1].lines.push(l);
  }
  const reportDate = parseJaDate(dateText, defaultYear) ?? parseJaDate(header, defaultYear);
  if (!reportDate) return null;

  const fields = emptyFields();
  const feedback: string[] = [];
  const unknownHeadings: string[] = [];
  for (const sec of sections) {
    const target = HEADINGS.find(([re]) => re.test(sec.heading))?.[1];
    if (target === "feedback") {
      feedback.push(joinLines(sec.lines.filter((l) => !PLACEHOLDER.test(l))));
    } else if (target === "condition") {
      const c = parseCondition(sec.lines);
      if (c.score !== null && fields.score === null) fields.score = c.score;
      fields.scoreNote = [fields.scoreNote, c.note].filter(Boolean).join("\n");
    } else if (target === "training") {
      append(fields, "training", joinLines(scheduleLines(sec.lines)));
    } else if (target === "taught" && sec.lines.some((l) => l in SUB_HEADINGS)) {
      let current: TextField = "taught";
      let buf: string[] = [];
      const flush = () => {
        append(fields, current, joinLines(buf));
        buf = [];
      };
      for (const l of sec.lines) {
        if (l in SUB_HEADINGS) {
          flush();
          current = SUB_HEADINGS[l];
        } else buf.push(l);
      }
      flush();
    } else if (target) {
      append(fields, target, joinLines(sec.lines));
    } else {
      // 決まった章にない見出し(「日報を踏まえて(相談済み)」など)は、見出しごと残す。
      unknownHeadings.push(sec.heading);
      append(fields, "noticed", joinLines([`【${sec.heading}】`, ...sec.lines]));
    }
  }
  for (const k of Object.keys(fields) as (keyof ReportFields)[]) {
    const v = fields[k];
    if (typeof v === "string") (fields as Record<string, unknown>)[k] = v.slice(0, k === "scoreNote" ? SCORE_NOTE_MAX : FIELD_MAX);
  }
  const fb = feedback.filter(Boolean).join("\n\n");
  return { reportDate, name, fields, feedback: fb || null, unknownHeadings };
}

/**
 * 「日報まとめ」の全文を、日報ごとに分けて読む。「【日報】」で始まる行から次の「【日報】」までが 1 日分
 * (見出しが 2 行続く日は、続きの行を同じ日の見出しとみなす)。日付の読めないものは skipped に数える。
 */
export function parseNippoDocument(text: string, defaultYear: number): { reports: ParsedReport[]; skipped: number } {
  const lines = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const chunks: string[][] = [];
  for (const line of lines) {
    if (REPORT_START.test(line.trim())) {
      const last = chunks[chunks.length - 1];
      // 見出しだけの直前の塊(2 行目の見出し)は、同じ日報としてつなげる。
      if (last && last.slice(1).every((l) => !l.trim())) continue;
      chunks.push([line.trim()]);
    } else if (chunks.length > 0) chunks[chunks.length - 1].push(line);
  }
  const reports: ParsedReport[] = [];
  let skipped = 0;
  for (const c of chunks) {
    const r = parseOne(c, defaultYear);
    if (r) reports.push(r);
    else skipped++;
  }
  return { reports, skipped };
}
