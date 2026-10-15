// 社員の一括取り込み(CSV)の、読み取りと正規化(純粋関数。DB に依存しない)。
// 取り込むのは 社員番号・氏名・フリガナ・役職・部署・入社日 だけ(docs/DESIGN.md 21 章)。
// DB への書き込みは scripts/import-employees.ts が行う。

export const IMPORT_COLUMNS = [
  "employee_number",
  "name",
  "name_kana",
  "position",
  "department",
  "hired_on",
] as const;

export type ImportRecord = {
  /** CSV の行番号(見出しを 1 行目とする) */
  line: number;
  employeeNumber: string;
  name: string;
  nameKana: string | null;
  positionName: string | null;
  departmentName: string | null;
  hiredOn: string;
};

export type ImportIssue = { line: number; message: string };

/** RFC 4180 の CSV を行・列に分ける(引用符・引用符内の改行とカンマに対応)。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 空行は除く
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/**
 * 半角カナ・全角英数を統一し(NFKC)、空白の連続を 1 つにまとめる。
 * 日本語を含む値は全角空白、英字だけの値(外国籍の方の氏名など)は半角空白にする。
 */
export function normalizeText(value: string): string {
  const v = value.normalize("NFKC").trim();
  const separator = /^[\x00-\x7F]*$/.test(v) ? " " : "　";
  return v.replace(/\s+/g, separator);
}

function optional(value: string | undefined): string | null {
  const v = normalizeText(value ?? "");
  return v === "" ? null : v;
}

/** `2021/9/21` や `2021-09-21` を `2021-09-21` にする。実在しない日付は null。 */
export function normalizeDate(value: string): string | null {
  const m = value.normalize("NFKC").trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * CSV を取り込み用のレコードに変換する。問題のある行は issues に入れ、records には含めない。
 * 1 行目は見出しで、IMPORT_COLUMNS と一致する必要がある。
 */
export function readImportCsv(text: string): { records: ImportRecord[]; issues: ImportIssue[] } {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((h) => h.trim());
  if (header.join(",") !== IMPORT_COLUMNS.join(",")) {
    return {
      records: [],
      issues: [{ line: 1, message: `見出しは ${IMPORT_COLUMNS.join(",")} にしてください。` }],
    };
  }

  const records: ImportRecord[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Map<string, number>();

  rows.slice(1).forEach((cols, i) => {
    const line = i + 2;
    const employeeNumber = normalizeText(cols[0] ?? "");
    const name = normalizeText(cols[1] ?? "");
    const hiredOn = normalizeDate(cols[5] ?? "");

    if (employeeNumber === "") return issues.push({ line, message: "社員番号が空です。" });
    if (name === "") return issues.push({ line, message: "氏名が空です。" });
    if (!hiredOn) return issues.push({ line, message: "入社日が読み取れません(例: 2021/9/21)。" });
    const dup = seen.get(employeeNumber);
    if (dup) return issues.push({ line, message: `社員番号が ${dup} 行目と重複しています。` });
    seen.set(employeeNumber, line);

    records.push({
      line,
      employeeNumber,
      name,
      nameKana: optional(cols[2]),
      positionName: optional(cols[3]),
      departmentName: optional(cols[4]),
      hiredOn,
    });
  });

  return { records, issues };
}
