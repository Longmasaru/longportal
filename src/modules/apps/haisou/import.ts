// 元の Google スプレッドシート「取引先一覧表」の各シート(CSV に書き出したもの)の読み取り(純粋関数。DB に依存しない)。
// DB への書き込みは scripts/import-haisou.ts が行う(docs/DESIGN.md 29 章)。
// シートの値は、書き出し方によって「9:00」「09:00:00」「1.0」のように揺れるので、ここでそろえる。
import { parseCsv } from "@/modules/core/employees/import";
import { parseDateLabel, parseLatLng } from "./schedule";

export type ImportIssue = { sheet: string; line: number; message: string };

export type ClientRecord = {
  rowNo: number;
  name: string;
  kana: string;
  person: string;
  address: string;
  tel: string;
  kind: 1 | 2;
  stayMin: number | null;
  lat: number | null;
  lng: number | null;
};

export type DriverRecord = { name: string; email: string; sortOrder: number };

export type HistoryRecord = {
  line: number;
  /** 同じ便(1 回の保存)の行に同じ番号。scripts 側で UUID に置き換える。 */
  batch: number;
  deliveryDate: string | null;
  dateLabel: string;
  shift: string;
  driver: string;
  startTime: string;
  backTime: string;
  seq: number;
  name: string;
  person: string;
  address: string;
  tel: string;
  yoken: string;
  detail: string;
  arrive: string;
  depart: string;
  stay: number | null;
  totalKm: number | null;
  totalMin: number | null;
  actualTime: string;
  mapUrl: string;
};

export type SavedRouteRecord = {
  name: string;
  savedAt: Date;
  deliveryDate: string;
  driver: string;
  amCount: number;
  pmCount: number;
  data: Record<string, unknown>;
};

const cell = (row: string[], i: number) => (row[i] ?? "").trim();
const isBlank = (row: string[]) => row.every((v) => !v.trim());

function toNumber(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** `9:00` / `09:00:00` → `09:00`(時刻でなければそのまま返す)。 */
export function normalizeClock(s: string): string {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : s.trim();
}

/** 取引先一覧。見出しは 1 行目。No.(row_no)は元のシートの行番号(見出しが 1 行目)をそのまま使う。 */
export function readClients(text: string): { records: ClientRecord[]; issues: ImportIssue[] } {
  const rows = parseCsv(text, { keepEmptyRows: true });
  const records: ClientRecord[] = [];
  const issues: ImportIssue[] = [];
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    if (isBlank(row)) return;
    const name = cell(row, 0);
    if (!name) {
      issues.push({ sheet: "取引先一覧", line, message: "会社名が空なので取り込みません" });
      return;
    }
    const kindNum = toNumber(cell(row, 5));
    const stay = toNumber(cell(row, 6));
    const lat = toNumber(cell(row, 7));
    const lng = toNumber(cell(row, 8));
    const hasLatLng = lat != null && lng != null && parseLatLng(`${lat},${lng}`) != null;
    if ((lat != null || lng != null) && !hasLatLng) {
      issues.push({ sheet: "取引先一覧", line, message: "緯度・経度の片方だけ、または読めない値なので、座標は取り込みません" });
    }
    records.push({
      rowNo: line,
      name,
      kana: cell(row, 1),
      person: cell(row, 2),
      address: cell(row, 3),
      tel: cell(row, 4),
      kind: kindNum === 2 ? 2 : 1,
      stayMin: stay != null && stay >= 0 ? Math.round(stay) : null,
      lat: hasLatLng ? lat : null,
      lng: hasLatLng ? lng : null,
    });
  });
  return { records, issues };
}

/** 配達者リスト。見出しは 1 行目。並びはシートの順。 */
export function readDrivers(text: string): { records: DriverRecord[]; issues: ImportIssue[] } {
  const rows = parseCsv(text, { keepEmptyRows: true });
  const records: DriverRecord[] = [];
  rows.slice(1).forEach((row) => {
    const name = cell(row, 0);
    if (!name) return;
    records.push({ name, email: cell(row, 1), sortOrder: records.length + 1 });
  });
  return { records, issues: [] };
}

/**
 * 配達ルート履歴。元のシートには見出しがない(1 行目から履歴)。見出しらしい行は飛ばす。
 * 1 回の保存は続いた行に書かれているので、順番が 1 に戻るか、日付・便・配達者・出発時刻が変わったら、次の便とする。
 */
export function readHistory(text: string): { records: HistoryRecord[]; issues: ImportIssue[] } {
  const rows = parseCsv(text, { keepEmptyRows: true });
  const records: HistoryRecord[] = [];
  const issues: ImportIssue[] = [];
  let batch = 0;
  let prevKey = "";
  let prevSeq = 0;
  rows.forEach((row, i) => {
    const line = i + 1;
    if (isBlank(row)) return;
    const seq = toNumber(cell(row, 5));
    if (seq == null) {
      if (i > 0) issues.push({ sheet: "配達ルート履歴", line, message: "順番が読めないので取り込みません" });
      return;
    }
    const name = cell(row, 6);
    if (!name) {
      issues.push({ sheet: "配達ルート履歴", line, message: "会社名が空なので取り込みません" });
      return;
    }
    const dateLabel = cell(row, 0);
    const deliveryDate = parseDateLabel(dateLabel);
    if (!deliveryDate) issues.push({ sheet: "配達ルート履歴", line, message: "日付が読めません(月ごとの一覧には出ません)" });
    const key = [dateLabel, cell(row, 1), cell(row, 2), normalizeClock(cell(row, 3))].join("|");
    if (key !== prevKey || seq <= prevSeq) batch++;
    prevKey = key;
    prevSeq = seq;
    const stay = toNumber(cell(row, 14));
    const totalMin = toNumber(cell(row, 16));
    records.push({
      line,
      batch,
      deliveryDate,
      dateLabel,
      shift: cell(row, 1),
      driver: cell(row, 2),
      startTime: normalizeClock(cell(row, 3)),
      backTime: normalizeClock(cell(row, 4)),
      seq: Math.round(seq),
      name,
      person: cell(row, 7),
      address: cell(row, 8),
      tel: cell(row, 9),
      yoken: cell(row, 10),
      detail: cell(row, 11),
      arrive: normalizeClock(cell(row, 12)),
      depart: normalizeClock(cell(row, 13)),
      stay: stay != null ? Math.round(stay) : null,
      totalKm: toNumber(cell(row, 15)),
      totalMin: totalMin != null ? Math.round(totalMin) : null,
      actualTime: cell(row, 17),
      mapUrl: (row[18] ?? "").trim(),
    });
  });
  return { records, issues };
}

/** `2026-09-14 22:29:35` / `2026/09/14 22:29` を JST の日時として読む。 */
export function parseJstDateTime(s: string): Date | null {
  const m = s.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const p = (v: string | undefined) => (v ?? "0").padStart(2, "0");
  const d = new Date(`${m[1]}-${p(m[2])}-${p(m[3])}T${p(m[4])}:${p(m[5])}:${p(m[6])}+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 保存ルート。見出しは 1 行目。同じ保存名が 2 回あれば、下の行(あとで保存したもの)を使う。 */
export function readSavedRoutes(text: string): { records: SavedRouteRecord[]; issues: ImportIssue[] } {
  const rows = parseCsv(text, { keepEmptyRows: true });
  const byName = new Map<string, SavedRouteRecord>();
  const issues: ImportIssue[] = [];
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    if (isBlank(row)) return;
    const name = cell(row, 0);
    if (!name) {
      issues.push({ sheet: "保存ルート", line, message: "保存名が空なので取り込みません" });
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(row[6] ?? "");
    } catch {
      issues.push({ sheet: "保存ルート", line, message: `「${name}」のデータ(JSON)が読めないので取り込みません` });
      return;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      issues.push({ sheet: "保存ルート", line, message: `「${name}」のデータの形が違うので取り込みません` });
      return;
    }
    const savedAt = parseJstDateTime(cell(row, 1));
    if (!savedAt) issues.push({ sheet: "保存ルート", line, message: `「${name}」の保存日時が読めないので、取り込んだ日時にします` });
    if (byName.has(name)) issues.push({ sheet: "保存ルート", line, message: `「${name}」が重複しているので、下の行を使います` });
    const dateCell = cell(row, 2);
    byName.set(name, {
      name,
      savedAt: savedAt ?? new Date(),
      deliveryDate: parseDateLabel(dateCell) ?? dateCell,
      driver: cell(row, 3),
      amCount: Math.round(toNumber(cell(row, 4)) ?? 0),
      pmCount: Math.round(toNumber(cell(row, 5)) ?? 0),
      data: data as Record<string, unknown>,
    });
  });
  return { records: [...byName.values()], issues };
}
