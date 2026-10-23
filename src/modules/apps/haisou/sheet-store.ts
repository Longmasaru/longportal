// 元の Google スプレッドシートを正(しょう)として、取引先・配達者・配達ルート履歴・保存ルートを読み書きする
// (docs/DESIGN.md 29 章「元のシートとの同期」)。書き方は、元の Apps Script(コード.gs)と同じにしてある。
// 元のツールとポータルのどちらで操作しても、同じシートに入るので、両方に同じものが見える。
// 他の人の操作で行がずれることがあるので、行を指す ID には中身の目印(ハッシュ)を付け、書く前に読み直して確かめる。
import { createHash } from "node:crypto";
import { DEFAULT_STAY, HISTORY_DETAIL_MAX, HISTORY_DETAIL_SCAN } from "./constants";
import { UserError } from "./errors";
import { formatSaved, formatStamp } from "./format";
import { parseJstDateTime, readClientRows, readHistoryRows, type HistoryRecord } from "./import";
import { parseDateLabel } from "./schedule";
import { a1, appendRows, asText, deleteRows, readRanges, writeRanges } from "./sheets-api";

export const TAB = {
  clients: "取引先一覧",
  drivers: "配達者リスト",
  history: "配達ルート履歴",
  saved: "保存ルート",
} as const;

/** 保存データの大きさの上限(文字数。元と同じ。シートの 1 マスは 5 万文字まで)。 */
const ROUTE_SAVE_MAX_CHARS = 45_000;
/** 保存ルートの件数の上限(元と同じ。超えたら古いものから消す)。 */
const ROUTE_SAVE_MAX = 50;

const hash8 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);
const cell = (row: string[] | undefined, i: number) => (row?.[i] ?? "").trim();
const toNum = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

/** 時刻らしければそのまま(シートで時刻になる)、ほかは文字として書く。 */
const clockOrText = (v: string) => (/^\d{1,2}:\d{2}$/.test(v) ? v : asText(v));

async function readTab(title: string, range: string): Promise<string[][]> {
  const [rows] = await readRanges([a1(title, range)]);
  return rows;
}

// ---- ID(行番号 + 中身の目印) ---------------------------------------------------------

const ID_RE = /^([rb])(\d+)(?:-(\d+))?\.([0-9a-f]{8})$/;

export function isSheetRowId(id: string): boolean {
  return ID_RE.test(id);
}

function parseId(id: string, kind: "r" | "b") {
  const m = id.match(ID_RE);
  if (!m || m[1] !== kind) throw new UserError("不正なリクエストです。");
  return { first: Number(m[2]), last: Number(m[3] ?? m[2]), mark: m[4] };
}

const STALE = "他の人が変更した可能性があります。読み込み直してください。";

// ---- 取引先 -----------------------------------------------------------------------

export async function getClients() {
  const { records } = readClientRows(await readTab(TAB.clients, "A1:I"));
  return records.map((c) => ({
    row: c.rowNo,
    name: c.name,
    kana: c.kana,
    person: c.person,
    address: c.address,
    tel: c.tel,
    kind: String(c.kind),
    stay: c.stayMin ?? DEFAULT_STAY,
    latlng: c.lat !== null && c.lng !== null ? `${c.lat},${c.lng}` : "",
  }));
}

/** 取引先の管理の一覧(元の cmListClients と同じ。表示どおりの文字列)。 */
export async function cmListClients() {
  const rows = await readTab(TAB.clients, "A1:I");
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!cell(r, 0)) continue;
    list.push({
      row: i + 1,
      name: cell(r, 0),
      kana: cell(r, 1),
      person: cell(r, 2),
      address: cell(r, 3),
      tel: cell(r, 4),
      kind: cell(r, 5),
      stay: cell(r, 6),
      lat: cell(r, 7),
      lng: cell(r, 8),
    });
  }
  return list;
}

export type NormalizedClient = {
  name: string;
  kana: string;
  person: string;
  address: string;
  tel: string;
  kind: number;
  stayMin: number | null;
  lat: number | null;
  lng: number | null;
};

function clientRow(v: NormalizedClient): (string | number)[] {
  return [
    asText(v.name),
    asText(v.kana),
    asText(v.person),
    asText(v.address),
    asText(v.tel), // 電話番号は文字として(先頭の 0 を消さない)
    v.kind,
    v.stayMin ?? "",
    v.lat ?? "",
    v.lng ?? "",
  ];
}

async function clientNames(): Promise<string[]> {
  return (await readTab(TAB.clients, "A1:A")).map((r) => cell(r, 0));
}

function findByName(names: string[], name: string, exceptRow: number): number {
  for (let i = 1; i < names.length; i++) if (i + 1 !== exceptRow && names[i] === name) return i + 1;
  return 0;
}

function locateRow(names: string[], row: number, originalName: string): number {
  if (row >= 2 && names[row - 1] === originalName) return row;
  const found = findByName(names, originalName, 0);
  if (found) return found;
  throw new UserError(`「${originalName}」が見つかりません。他の人が変更・削除した可能性があります。一覧を読み込み直してください。`);
}

/** 緯度・経度を書くときは、H1・I1 に見出しを入れる(元の cmEnsureColumns_ と同じ)。 */
async function ensureLatLngHeader(v: NormalizedClient) {
  if (v.lat === null) return;
  const [head] = await readTab(TAB.clients, "H1:I1");
  if (!cell(head, 0)) await writeRanges([{ range: a1(TAB.clients, "H1:I1"), values: [["緯度", "経度"]] }]);
}

export async function cmAddClient(v: NormalizedClient, allowDuplicate: boolean) {
  const names = await clientNames();
  if (!allowDuplicate && findByName(names, v.name, 0)) throw new UserError(`DUP:「${v.name}」はすでに登録されています`);
  await ensureLatLngHeader(v);
  // A 列に会社名がある最後の行の次に書く(元と同じ)
  let lastData = 1;
  for (let i = names.length - 1; i >= 0; i--) {
    if (names[i]) {
      lastData = i + 1;
      break;
    }
  }
  const newRow = lastData + 1;
  await writeRanges([{ range: a1(TAB.clients, `A${newRow}:I${newRow}`), values: [clientRow(v)] }]);
  return { row: newRow, message: `「${v.name}」を ${newRow}行目に追加しました` };
}

export async function cmUpdateClient(rowNo: number, originalName: string, v: NormalizedClient, allowDuplicate: boolean) {
  const names = await clientNames();
  const row = locateRow(names, rowNo, originalName);
  if (!allowDuplicate && v.name !== originalName && findByName(names, v.name, row)) {
    throw new UserError(`DUP:「${v.name}」はすでに登録されています`);
  }
  await ensureLatLngHeader(v);
  await writeRanges([{ range: a1(TAB.clients, `A${row}:I${row}`), values: [clientRow(v)] }]);
  return { row, message: `「${v.name}」(${row}行目)を変更しました` };
}

export async function cmDeleteClient(rowNo: number, originalName: string) {
  const row = locateRow(await clientNames(), rowNo, originalName);
  await deleteRows(TAB.clients, [row]);
  return { message: `「${originalName}」(${row}行目)を削除しました` };
}

// ---- 配達者(A: 氏名、B: メール。C 列より右(LINE WORKS など)は元のツールのもので、触らない) ----------

type DriverRow = { id: string; row: number; name: string; email: string };

async function driverRows(): Promise<DriverRow[]> {
  const rows = await readTab(TAB.drivers, "A1:B");
  const list: DriverRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const name = cell(rows[i], 0);
    if (!name) continue;
    list.push({ id: `r${i + 1}.${hash8(name)}`, row: i + 1, name, email: cell(rows[i], 1) });
  }
  return list;
}

export async function getDrivers() {
  return (await driverRows()).map((d) => ({ name: d.name, email: d.email }));
}

export async function dmListDrivers() {
  return (await driverRows()).map((d) => ({ id: d.id, name: d.name, email: d.email }));
}

async function locateDriver(id: string): Promise<DriverRow> {
  const { first } = parseId(id, "r");
  const d = (await driverRows()).find((x) => x.row === first);
  if (!d || d.id !== id) throw new UserError(`配達者が見つかりません。${STALE}`);
  return d;
}

export async function dmAddDriver(v: { name: string; email: string }) {
  await appendRows(a1(TAB.drivers, "A1:B"), [[asText(v.name), asText(v.email)]]);
  return `「${v.name}」を追加しました`;
}

export async function dmUpdateDriver(id: string, v: { name: string; email: string }) {
  const d = await locateDriver(id);
  await writeRanges([{ range: a1(TAB.drivers, `A${d.row}:B${d.row}`), values: [[asText(v.name), asText(v.email)]] }]);
  return `「${v.name}」を変更しました`;
}

export async function dmDeleteDriver(id: string) {
  const d = await locateDriver(id);
  await deleteRows(TAB.drivers, [d.row]);
  return `「${d.name}」を削除しました(保存済みのルート表・履歴はそのまま残ります)`;
}

/** 並び順を 1 つ上下に動かす(行の中身を、LINE WORKS の列も含めて入れ替える)。 */
export async function dmMoveDriver(id: string, dir: -1 | 1) {
  const list = await driverRows();
  const i = list.findIndex((d) => d.id === id);
  if (i < 0) throw new UserError(`配達者が見つかりません。${STALE}`);
  const j = i + dir;
  if (j < 0 || j >= list.length) return "ok";
  const [a, b] = [list[i].row, list[j].row];
  const [rowA, rowB] = await readRanges([a1(TAB.drivers, `A${a}:Z${a}`), a1(TAB.drivers, `A${b}:Z${b}`)]);
  const width = Math.max(rowA[0]?.length ?? 0, rowB[0]?.length ?? 0, 2);
  const pad = (r: string[] | undefined) => Array.from({ length: width }, (_, k) => asText(r?.[k] ?? ""));
  await writeRanges([
    { range: a1(TAB.drivers, `A${a}`), values: [pad(rowB[0])] },
    { range: a1(TAB.drivers, `A${b}`), values: [pad(rowA[0])] },
  ]);
  return "ok";
}

// ---- 配達ルート履歴(見出しなし。1 行 = 1 訪問。R 列「実時間」は手入力) ------------------------

async function historyRecords(): Promise<HistoryRecord[]> {
  return readHistoryRows(await readTab(TAB.history, "A1:S")).records;
}

const rowMark = (r: HistoryRecord) => hash8(`${r.dateLabel}|${r.name}|${r.seq}`);

function batchesOf(records: HistoryRecord[]) {
  const map = new Map<number, HistoryRecord[]>();
  for (const r of records) {
    const list = map.get(r.batch) ?? [];
    list.push(r);
    map.set(r.batch, list);
  }
  return map;
}

const batchId = (rows: HistoryRecord[]) =>
  `b${rows[0].line}-${rows[rows.length - 1].line}.${hash8(rows.map((r) => `${r.line}|${r.name}`).join("\n"))}`;

export type SheetRouteResult = {
  date: string;
  shift: string;
  driver: string;
  startTime: string;
  backTime: string;
  totalKm: number | null;
  totalMin: number;
  links: { url: string }[];
  schedule: {
    no: number;
    name: string;
    person: string;
    address: string;
    tel: string;
    yoken: string;
    detail: string;
    arrive: string;
    depart: string;
    stay: number;
  }[];
};

export async function saveHistory(result: SheetRouteResult) {
  const url = result.links.map((l) => l.url).join("\n");
  const rows = result.schedule.map((s, i) => [
    asText(result.date),
    asText(result.shift),
    asText(result.driver),
    clockOrText(result.startTime),
    clockOrText(result.backTime),
    s.no,
    asText(s.name),
    asText(s.person),
    asText(s.address),
    asText(s.tel),
    asText(s.yoken),
    asText(s.detail),
    clockOrText(s.arrive),
    clockOrText(s.depart),
    s.stay,
    i === 0 ? (result.totalKm ?? "") : "",
    i === 0 ? result.totalMin : "",
    "", // R 列(実時間)は手入力のため空欄
    i === 0 ? asText(url) : "",
  ]);
  if (rows.length) await appendRows(a1(TAB.history, "A1:S"), rows);
  return `${TAB.history} に ${rows.length}件 保存しました`;
}

export async function listHistory(month: string, driver: string) {
  const records = await historyRecords();
  const batches = batchesOf(records);
  const ids = new Map<number, string>();
  for (const [b, rows] of batches) ids.set(b, batchId(rows));
  return records
    .filter((r) => r.deliveryDate?.startsWith(`${month}-`) && (!driver || r.driver === driver))
    .sort((x, y) => (y.deliveryDate ?? "").localeCompare(x.deliveryDate ?? "") || x.line - y.line)
    .map((r) => {
      const first = batches.get(r.batch)?.[0] === r;
      return {
        id: `r${r.line}.${rowMark(r)}`,
        batchId: ids.get(r.batch) ?? "",
        deliveryDate: r.deliveryDate ?? "",
        dateLabel: r.dateLabel,
        shift: r.shift,
        driver: r.driver,
        startTime: r.startTime,
        backTime: r.backTime,
        seq: r.seq,
        name: r.name,
        person: r.person,
        address: r.address,
        yoken: r.yoken,
        detail: r.detail,
        arrive: r.arrive,
        depart: r.depart,
        stay: r.stay,
        totalKm: first ? r.totalKm : null,
        totalMin: first ? r.totalMin : null,
        actualTime: r.actualTime,
        mapUrl: r.mapUrl,
      };
    });
}

export async function setHistoryActual(id: string, value: string) {
  const { first, mark } = parseId(id, "r");
  const r = (await historyRecords()).find((x) => x.line === first);
  if (!r || rowMark(r) !== mark) throw new UserError(`履歴が見つかりません。${STALE}`);
  await writeRanges([{ range: a1(TAB.history, `R${first}`), values: [[asText(value)]] }]);
  return "ok";
}

export async function deleteHistoryBatch(id: string) {
  const { first } = parseId(id, "b");
  const rows = [...batchesOf(await historyRecords()).values()].find((b) => b[0].line === first);
  if (!rows || batchId(rows) !== id) throw new UserError(`履歴が見つかりません。${STALE}`);
  await deleteRows(
    TAB.history,
    rows.map((r) => r.line),
  );
  return `配達履歴から ${rows.length}件 削除しました`;
}

/** 履歴から、会社ごとの「詳細」の候補(新しい順に、重複なしで 8 件まで)。 */
export async function getHistoryDetailsByCompany() {
  const records = (await historyRecords()).slice(-HISTORY_DETAIL_SCAN).reverse();
  const map: Record<string, string[]> = {};
  for (const r of records) {
    const company = r.name.trim();
    const detail = r.detail.trim();
    if (!company || !detail) continue;
    const list = (map[company] ??= []);
    if (!list.includes(detail) && list.length < HISTORY_DETAIL_MAX) list.push(detail);
  }
  return map;
}

export async function listHistoryDrivers() {
  const drivers = (await driverRows()).map((d) => d.name);
  const extra = [...new Set((await historyRecords()).map((r) => r.driver))].filter((n) => n && !drivers.includes(n));
  return [...drivers, ...extra.sort()];
}

// ---- 保存ルート(A: 保存名、B: 保存日時、C: 配達日、D: 配達者、E・F: AM・PM 件数、G: データ(JSON)) ----------

type SavedPayload = { date?: unknown; driver?: unknown; stops?: { AM?: unknown[]; PM?: unknown[] } };

async function savedNames(): Promise<string[]> {
  return (await readTab(TAB.saved, "A1:A")).map((r) => cell(r, 0));
}

export async function saveRouteState(name: string, payload: SavedPayload) {
  const json = JSON.stringify(payload);
  if (json.length > ROUTE_SAVE_MAX_CHARS) {
    throw new UserError("データが大きすぎて保存できません(配達先の件数を減らしてください)");
  }
  const amCount = Array.isArray(payload?.stops?.AM) ? payload.stops.AM.length : 0;
  const pmCount = Array.isArray(payload?.stops?.PM) ? payload.stops.PM.length : 0;
  const date = typeof payload?.date === "string" ? payload.date : "";
  const driver = typeof payload?.driver === "string" ? payload.driver : "";
  const row = [
    asText(name),
    formatStamp(new Date()),
    parseDateLabel(date) ? date : asText(date),
    asText(driver),
    amCount,
    pmCount,
    asText(json),
  ];
  const names = await savedNames();
  const idx = names.indexOf(name, 1);
  if (idx >= 1) {
    await writeRanges([{ range: a1(TAB.saved, `A${idx + 1}:G${idx + 1}`), values: [row] }]);
  } else {
    await appendRows(a1(TAB.saved, "A1:G"), [row]);
    // 上限を超えたら、上(古いもの)から消す(元と同じ)
    const count = (await savedNames()).length - 1;
    const over = count - ROUTE_SAVE_MAX;
    if (over > 0) await deleteRows(TAB.saved, Array.from({ length: over }, (_, k) => k + 2));
  }
  return `「${name}」を保存しました(AM ${amCount}件/PM ${pmCount}件)`;
}

/** 保存一覧(新しい順 = シートの下から)。 */
export async function listRouteStates() {
  const rows = await readTab(TAB.saved, "A1:F");
  return rows
    .slice(1)
    .filter((r) => cell(r, 0))
    .map((r) => {
      const saved = parseJstDateTime(cell(r, 1));
      const dateCell = cell(r, 2);
      return {
        name: cell(r, 0),
        saved: saved ? formatSaved(saved) : cell(r, 1),
        date: parseDateLabel(dateCell) ?? dateCell,
        driver: cell(r, 3),
        am: Math.round(toNum(cell(r, 4)) ?? 0),
        pm: Math.round(toNum(cell(r, 5)) ?? 0),
      };
    })
    .reverse();
}

export async function loadRouteState(name: string): Promise<unknown> {
  const idx = (await savedNames()).indexOf(name, 1);
  if (idx < 1) throw new UserError(`「${name}」が見つかりません`);
  const [r] = await readTab(TAB.saved, `G${idx + 1}`);
  try {
    return JSON.parse(cell(r, 0));
  } catch {
    throw new UserError(`保存データが壊れています(「${name}」)`);
  }
}

export async function deleteRouteState(name: string) {
  const idx = (await savedNames()).indexOf(name, 1);
  if (idx < 1) throw new UserError(`「${name}」が見つかりません`);
  await deleteRows(TAB.saved, [idx + 1]);
  return `「${name}」を削除しました`;
}

