// 配達ルートのサーバー側の処理。元の Apps Script(コード.gs)の関数と同じ名前・同じ戻り値にしてあり、
// 画面(元の dialog.html / clients.html)は google.script.run の代わりに、これを /apps/haisou/api 経由で呼ぶ。
// 呼び出しの入口(rpc.ts)で、アプリを使えるか(requireAppAccess)と引数の形を確かめてから呼ぶ。
import { and, asc, desc, eq, gte, isNull, lt, max, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { DEFAULT_STAY, GEOCODE_PREFIX, HISTORY_DETAIL_MAX, HISTORY_DETAIL_SCAN } from "./constants";
import { computeRoute, geocode, mapsApiKey } from "./maps";
import {
  buildMapLinks,
  buildSchedule,
  formatDateLabel,
  legsFrom,
  parseDateLabel,
  rescheduleTimes,
  type MapLink,
  type ScheduleEntry,
  type Stop,
} from "./schedule";
import {
  haisouClients,
  haisouCompanyDefaults,
  haisouDrivers,
  haisouGeocodeCache,
  haisouHistory,
  haisouSavedRoutes,
} from "./schema";

import { UserError } from "./errors";
import { formatSaved } from "./format";
import * as sheet from "./sheet-store";
import { sheetConfigured } from "./sheets-api";
export { UserError };


// ---- 取引先・配達者(ルート作成画面) -------------------------------------------------

export type ClientForRoute = {
  row: number;
  name: string;
  kana: string;
  person: string;
  address: string;
  tel: string;
  /** '1' = 受注先、'2' = 外注先 */
  kind: string;
  stay: number;
  latlng: string;
};

const activeClients = isNull(haisouClients.deletedAt);

export async function getClients(): Promise<ClientForRoute[]> {
  if (sheetConfigured()) return sheet.getClients();
  const rows = await db.select().from(haisouClients).where(activeClients).orderBy(asc(haisouClients.rowNo));
  return rows.map((c) => ({
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

export async function getDrivers(): Promise<{ name: string; email: string }[]> {
  if (sheetConfigured()) return sheet.getDrivers();
  return db
    .select({ name: haisouDrivers.name, email: haisouDrivers.email })
    .from(haisouDrivers)
    .orderBy(asc(haisouDrivers.sortOrder), asc(haisouDrivers.createdAt));
}

// ---- 会社ごとの前回入力・過去の詳細 ------------------------------------------------------

type CompanyDefault = { yoken: string; detail: string; stay: number | null };

export async function getCompanyDefaults(userId: string): Promise<Record<string, CompanyDefault>> {
  const rows = await db.select().from(haisouCompanyDefaults).where(eq(haisouCompanyDefaults.userId, userId));
  return Object.fromEntries(rows.map((r) => [`n:${r.companyName}`, { yoken: r.yoken, detail: r.detail, stay: r.stay }]));
}

export async function saveCompanyDefaults(
  userId: string,
  entries: { name?: string; yoken: string; detail: string; stay: number }[],
): Promise<string> {
  for (const e of entries) {
    if (!e.name) continue;
    await db
      .insert(haisouCompanyDefaults)
      .values({ userId, companyName: e.name, yoken: e.yoken, detail: e.detail, stay: e.stay })
      .onConflictDoUpdate({
        target: [haisouCompanyDefaults.userId, haisouCompanyDefaults.companyName],
        set: { yoken: e.yoken, detail: e.detail, stay: e.stay },
      });
  }
  return "ok";
}

/** 履歴から、会社ごとの「詳細」の候補(新しい順に、重複なしで 8 件まで)。 */
export async function getHistoryDetailsByCompany(): Promise<Record<string, string[]>> {
  if (sheetConfigured()) return sheet.getHistoryDetailsByCompany();
  const rows = await db
    .select({ name: haisouHistory.name, detail: haisouHistory.detail })
    .from(haisouHistory)
    .orderBy(desc(haisouHistory.lineNo))
    .limit(HISTORY_DETAIL_SCAN);
  const map: Record<string, string[]> = {};
  for (const r of rows) {
    const company = r.name.trim();
    const detail = r.detail.trim();
    if (!company || !detail) continue;
    const list = (map[company] ??= []);
    if (!list.includes(detail) && list.length < HISTORY_DETAIL_MAX) list.push(detail);
  }
  return map;
}

// ---- ルート計算 ----------------------------------------------------------------------

export type CalcPayload = {
  date: string;
  startTime: string;
  shift: string;
  driver: string;
  driverEmail: string;
  optimize?: boolean;
  avoidHighways?: boolean;
  stops: Stop[];
};

export type RouteResult = {
  date: string;
  dateRaw: string;
  shift: string;
  driver: string;
  driverEmail: string;
  startTime: string;
  backTime: string;
  avoidHighways: boolean;
  lastLegMin: number;
  lastLegKm: number | null;
  totalMin: number;
  totalKm: number | null;
  optimized: boolean;
  reason: string;
  schedule: ScheduleEntry[];
  links: MapLink[];
};

/** 住所 → 「緯度,経度」(控えがあれば使う)。 */
async function geocodeCached(address: string): Promise<{ latlng: string } | { status: string }> {
  const [hit] = await db
    .select({ latlng: haisouGeocodeCache.latlng })
    .from(haisouGeocodeCache)
    .where(
      and(eq(haisouGeocodeCache.address, address), gte(haisouGeocodeCache.createdAt, sql`now() - interval '30 days'`)),
    );
  if (hit) return { latlng: hit.latlng };
  try {
    const g = await geocode(GEOCODE_PREFIX + address);
    if (!g.ok) return { status: g.status };
    const latlng = `${g.lat},${g.lng}`;
    await db
      .insert(haisouGeocodeCache)
      .values({ address, latlng })
      .onConflictDoUpdate({ target: haisouGeocodeCache.address, set: { latlng, createdAt: sql`now()` } });
    return { latlng };
  } catch (e) {
    return { status: e instanceof Error ? e.message : String(e) };
  }
}

export async function calcRoute(payload: CalcPayload, today: string): Promise<RouteResult> {
  const stops = payload.stops.map((s) => ({ ...s }));
  if (stops.length === 0) throw new UserError("配達先が選択されていません");
  const doOptimize = payload.optimize !== false;
  const hasKey = mapsApiKey() !== null;

  let failReason = "";

  // 1) 住所を位置に変える(緯度・経度の登録があれば、そちらを優先)
  const geoFails: string[] = [];
  if (hasKey) {
    for (const s of stops) {
      if (s.latlng) continue;
      const r = await geocodeCached(s.address);
      if ("latlng" in r) s.latlng = r.latlng;
      else geoFails.push(`${s.name}(${r.status})`);
    }
  }
  const locOf = (s: Stop) => s.latlng || s.address;

  // 2) 訪問順の最適化と、区間ごとの移動時間
  let order = stops.map((_, i) => i);
  let legSecs: number[] | null = null;
  let legMeters: number[] | null = null;
  try {
    const r = await computeRoute(stops.map(locOf), {
      optimize: doOptimize,
      avoidHighways: !!payload.avoidHighways,
    });
    if (r.ok) {
      order = doOptimize ? r.order : order;
      legSecs = r.legSecs;
      legMeters = r.legMeters;
    } else {
      failReason = r.reason;
    }
  } catch (e) {
    failReason = `地図サービスのエラー: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (geoFails.length) {
    failReason =
      `住所を特定できない先: ${geoFails.join("、")}` +
      (failReason ? ` / ${failReason}` : "") +
      " → 取引先の管理で緯度・経度を登録してください";
  }

  // 3) タイムスケジュール(休憩をまたぐときは自動でずらす)
  const ordered = order.map((i) => stops[i]);
  const { legMins, legKm, totalMin, totalKm } = legsFrom(ordered.length, legSecs, legMeters);
  const { schedule, backTime } = buildSchedule(ordered, payload.startTime, legMins, legKm);

  // 4) Google マップのリンク(経由地 9 件まで。超えたら分ける)
  const links = buildMapLinks(ordered.map(locOf), !!payload.avoidHighways);

  // 5) 配達日(未指定なら今日)
  const dateRaw = parseDateLabel(payload.date) ?? today;

  return {
    date: formatDateLabel(dateRaw),
    dateRaw: payload.date || dateRaw,
    shift: payload.shift || "",
    driver: payload.driver || "",
    driverEmail: payload.driverEmail || "",
    startTime: payload.startTime,
    backTime,
    avoidHighways: !!payload.avoidHighways,
    lastLegMin: legMins[ordered.length],
    lastLegKm: legKm[ordered.length],
    totalMin,
    totalKm,
    optimized: legSecs !== null,
    reason: failReason,
    schedule,
    links,
  };
}

/** 待ち時間を入れ直したルート表の時刻を付け直す(地図サービスは呼ばない)。 */
export function reschedule(result: RouteResult): RouteResult {
  return rescheduleTimes(result);
}

// ---- 配達履歴 ------------------------------------------------------------------------

export async function saveHistory(result: RouteResult, userId: string): Promise<string> {
  if (sheetConfigured()) return sheet.saveHistory(result);
  const batchId = crypto.randomUUID();
  const url = result.links.map((l) => l.url).join("\n");
  const deliveryDate = parseDateLabel(result.dateRaw) ?? parseDateLabel(result.date);
  if (result.schedule.length) {
    await db.insert(haisouHistory).values(
      result.schedule.map((s, i) => ({
        batchId,
        deliveryDate,
        dateLabel: result.date,
        shift: result.shift,
        driver: result.driver,
        startTime: result.startTime,
        backTime: result.backTime,
        seq: s.no,
        name: s.name,
        person: s.person,
        address: s.address,
        tel: s.tel,
        yoken: s.yoken,
        detail: s.detail,
        arrive: s.arrive,
        depart: s.depart,
        stay: s.stay,
        totalKm: i === 0 ? result.totalKm : null,
        totalMin: i === 0 ? result.totalMin : null,
        mapUrl: i === 0 ? url : "",
        createdBy: userId,
      })),
    );
  }
  return `配達履歴に ${result.schedule.length}件 保存しました`;
}

export type HistoryRow = {
  id: string;
  batchId: string;
  deliveryDate: string;
  dateLabel: string;
  shift: string;
  driver: string;
  startTime: string;
  backTime: string;
  seq: number;
  name: string;
  person: string;
  address: string;
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

/** 配達履歴(月ごと。配達者で絞り込める)。新しい日付が先、同じ日の中は保存した順。 */
export async function listHistory(month: string, driver: string): Promise<HistoryRow[]> {
  if (sheetConfigured()) return sheet.listHistory(month, driver);
  const [y, m] = month.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const conds = [gte(haisouHistory.deliveryDate, from), lt(haisouHistory.deliveryDate, next)];
  if (driver) conds.push(eq(haisouHistory.driver, driver));
  const rows = await db
    .select()
    .from(haisouHistory)
    .where(and(...conds))
    .orderBy(desc(haisouHistory.deliveryDate), asc(haisouHistory.lineNo));
  return rows.map((r) => ({
    id: r.id,
    batchId: r.batchId,
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
    totalKm: r.totalKm,
    totalMin: r.totalMin,
    actualTime: r.actualTime,
    mapUrl: r.mapUrl,
  }));
}

/** 実時間(元のシートの R 列。手入力)。 */
export async function setHistoryActual(id: string, value: string): Promise<string> {
  if (sheetConfigured()) return sheet.setHistoryActual(id, value);
  const [row] = await db
    .update(haisouHistory)
    .set({ actualTime: value })
    .where(eq(haisouHistory.id, id))
    .returning({ id: haisouHistory.id });
  if (!row) throw new UserError("履歴が見つかりません。読み込み直してください。");
  return "ok";
}

/** 1 つの便(同じ「履歴に保存」で入った行)をまとめて消す。二重に保存したときなどに使う。 */
export async function deleteHistoryBatch(batchId: string): Promise<string> {
  if (sheetConfigured()) return sheet.deleteHistoryBatch(batchId);
  const rows = await db.delete(haisouHistory).where(eq(haisouHistory.batchId, batchId)).returning({ id: haisouHistory.id });
  if (!rows.length) throw new UserError("履歴が見つかりません。読み込み直してください。");
  return `配達履歴から ${rows.length}件 削除しました`;
}

// ---- 保存したルート表 ------------------------------------------------------------------

/** 保存データの大きさの上限(文字数)。 */
const ROUTE_SAVE_MAX_CHARS = 1_000_000;

type SavedPayload = { date?: unknown; driver?: unknown; stops?: { AM?: unknown[]; PM?: unknown[] } };

export async function saveRouteState(nameInput: string, payload: SavedPayload, userId: string): Promise<string> {
  const name = String(nameInput || "").trim();
  if (!name) throw new UserError("保存名を入力してください");
  if (JSON.stringify(payload).length > ROUTE_SAVE_MAX_CHARS) {
    throw new UserError("データが大きすぎて保存できません(配達先の件数を減らしてください)");
  }
  if (sheetConfigured()) return sheet.saveRouteState(name, payload);
  const amCount = Array.isArray(payload?.stops?.AM) ? payload.stops.AM.length : 0;
  const pmCount = Array.isArray(payload?.stops?.PM) ? payload.stops.PM.length : 0;
  const values = {
    name,
    deliveryDate: typeof payload?.date === "string" ? payload.date : "",
    driver: typeof payload?.driver === "string" ? payload.driver : "",
    amCount,
    pmCount,
    data: payload,
    updatedBy: userId,
  };
  await db
    .insert(haisouSavedRoutes)
    .values(values)
    .onConflictDoUpdate({
      target: haisouSavedRoutes.name,
      set: { ...values, savedAt: sql`now()` },
    });
  return `「${name}」を保存しました(AM ${amCount}件/PM ${pmCount}件)`;
}

/** 保存一覧(新しい順)。 */
export async function listRouteStates(): Promise<
  { name: string; saved: string; date: string; driver: string; am: number; pm: number }[]
> {
  if (sheetConfigured()) return sheet.listRouteStates();
  const rows = await db
    .select({
      name: haisouSavedRoutes.name,
      savedAt: haisouSavedRoutes.savedAt,
      date: haisouSavedRoutes.deliveryDate,
      driver: haisouSavedRoutes.driver,
      am: haisouSavedRoutes.amCount,
      pm: haisouSavedRoutes.pmCount,
    })
    .from(haisouSavedRoutes)
    .orderBy(desc(haisouSavedRoutes.createdAt), desc(haisouSavedRoutes.name));
  return rows.map((r) => ({
    name: r.name,
    saved: formatSaved(r.savedAt),
    date: r.date,
    driver: r.driver,
    am: r.am,
    pm: r.pm,
  }));
}

export async function loadRouteState(nameInput: string): Promise<unknown> {
  const name = String(nameInput || "").trim();
  if (sheetConfigured()) return sheet.loadRouteState(name);
  const [row] = await db
    .select({ data: haisouSavedRoutes.data })
    .from(haisouSavedRoutes)
    .where(eq(haisouSavedRoutes.name, name));
  if (!row) throw new UserError(`「${name}」が見つかりません`);
  return row.data;
}

export async function deleteRouteState(nameInput: string): Promise<string> {
  const name = String(nameInput || "").trim();
  if (sheetConfigured()) return sheet.deleteRouteState(name);
  const rows = await db
    .delete(haisouSavedRoutes)
    .where(eq(haisouSavedRoutes.name, name))
    .returning({ id: haisouSavedRoutes.id });
  if (!rows.length) throw new UserError(`「${name}」が見つかりません`);
  return `「${name}」を削除しました`;
}

// ---- 取引先の管理(clients.html) -------------------------------------------------------

export type ClientInput = {
  name: string;
  kana: string;
  person: string;
  address: string;
  tel: string;
  kind: string;
  stay: string;
  lat: string;
  lng: string;
  allowDuplicate?: boolean;
};

/** 画面の一覧(値は文字列。滞在・緯度経度が無ければ空文字)。 */
export async function cmListClients() {
  if (sheetConfigured()) return sheet.cmListClients();
  const rows = await db.select().from(haisouClients).where(activeClients).orderBy(asc(haisouClients.rowNo));
  return rows.map((c) => ({
    row: c.rowNo,
    name: c.name,
    kana: c.kana,
    person: c.person,
    address: c.address,
    tel: c.tel,
    kind: String(c.kind),
    stay: c.stayMin === null ? "" : String(c.stayMin),
    lat: c.lat === null ? "" : String(c.lat),
    lng: c.lng === null ? "" : String(c.lng),
  }));
}

/** 入力の確認と整形(元の cmNormalize_ と同じ規則)。 */
export function normalizeClient(c: ClientInput) {
  const t = (v: unknown) => String(v ?? "").trim();
  const name = t(c.name);
  if (!name) throw new UserError("会社名を入力してください");
  const kind = t(c.kind) === "2" ? 2 : 1;
  const stayText = t(c.stay);
  if (stayText !== "" && !/^\d+$/.test(stayText)) throw new UserError("滞在時間は0以上の整数(分)で入力してください");
  const lat = t(c.lat);
  const lng = t(c.lng);
  if ((lat === "") !== (lng === "")) throw new UserError("緯度と経度は両方入力するか、両方空欄にしてください");
  if (lat !== "") {
    const la = Number(lat);
    const ln = Number(lng);
    if (Number.isNaN(la) || Number.isNaN(ln) || la < 20 || la > 46 || ln < 122 || ln > 154) {
      throw new UserError("緯度・経度の値が正しくありません(例:緯度 36.6376 / 経度 136.6617)");
    }
  }
  return {
    name,
    kana: t(c.kana),
    person: t(c.person),
    address: t(c.address),
    tel: t(c.tel),
    kind,
    stayMin: stayText === "" ? null : Number(stayText),
    lat: lat === "" ? null : Number(lat),
    lng: lng === "" ? null : Number(lng),
  };
}

async function findActiveByName(name: string, exceptRowNo: number) {
  const rows = await db
    .select({ rowNo: haisouClients.rowNo })
    .from(haisouClients)
    .where(and(activeClients, eq(haisouClients.name, name)));
  return rows.find((r) => r.rowNo !== exceptRowNo)?.rowNo ?? 0;
}

/** 画面で選んだ取引先が、今もあるか確かめる(他の人が変えた場合の対策。番号が合わなければ会社名で探す)。 */
async function locateClient(rowNo: number, originalName: string) {
  const [byRow] = await db
    .select()
    .from(haisouClients)
    .where(and(activeClients, eq(haisouClients.rowNo, rowNo), eq(haisouClients.name, originalName)));
  if (byRow) return byRow;
  const [byName] = await db
    .select()
    .from(haisouClients)
    .where(and(activeClients, eq(haisouClients.name, originalName)))
    .orderBy(asc(haisouClients.rowNo));
  if (byName) return byName;
  throw new UserError(`「${originalName}」が見つかりません。他の人が変更・削除した可能性があります。一覧を読み込み直してください。`);
}

export async function cmAddClient(c: ClientInput, userId: string): Promise<{ row: number; message: string }> {
  const v = normalizeClient(c);
  if (sheetConfigured()) return sheet.cmAddClient(v, !!c.allowDuplicate);
  if (!c.allowDuplicate && (await findActiveByName(v.name, 0))) {
    throw new UserError(`DUP:「${v.name}」はすでに登録されています`);
  }
  // 番号は最大値 + 1(同時に追加されて重なったら、もう一度だけ取り直す)
  for (let attempt = 0; ; attempt++) {
    const [{ maxRow }] = await db.select({ maxRow: max(haisouClients.rowNo) }).from(haisouClients);
    const rowNo = Math.max(maxRow ?? 1, 1) + 1;
    try {
      await db.insert(haisouClients).values({ ...v, rowNo, updatedBy: userId });
      return { row: rowNo, message: `「${v.name}」を追加しました` };
    } catch (e) {
      if (attempt >= 1) throw e;
    }
  }
}

export async function cmUpdateClient(
  rowNo: number,
  originalName: string,
  c: ClientInput,
  userId: string,
): Promise<{ row: number; message: string }> {
  if (sheetConfigured()) return sheet.cmUpdateClient(rowNo, originalName, normalizeClient(c), !!c.allowDuplicate);
  const cur = await locateClient(rowNo, originalName);
  const v = normalizeClient(c);
  if (!c.allowDuplicate && v.name !== originalName && (await findActiveByName(v.name, cur.rowNo))) {
    throw new UserError(`DUP:「${v.name}」はすでに登録されています`);
  }
  await db
    .update(haisouClients)
    .set({ ...v, updatedBy: userId })
    .where(eq(haisouClients.id, cur.id));
  return { row: cur.rowNo, message: `「${v.name}」を変更しました` };
}

export async function cmDeleteClient(rowNo: number, originalName: string, userId: string): Promise<{ message: string }> {
  if (sheetConfigured()) return sheet.cmDeleteClient(rowNo, originalName);
  const cur = await locateClient(rowNo, originalName);
  await db
    .update(haisouClients)
    .set({ deletedAt: new Date(), updatedBy: userId })
    .where(eq(haisouClients.id, cur.id));
  return { message: `「${originalName}」を削除しました` };
}

/** 住所の確認(Google マップで探した結果)。 */
export async function cmGeocode(addressInput: string) {
  const address = String(addressInput || "").trim();
  if (!address) throw new UserError("住所を入力してください");
  const g = await geocode(GEOCODE_PREFIX + address);
  if (!g.ok) return { ok: false as const, status: g.status };
  return {
    ok: true as const,
    lat: Math.round(g.lat * 1e6) / 1e6,
    lng: Math.round(g.lng * 1e6) / 1e6,
    formatted: g.formatted,
    partial: g.partial,
    type: g.type,
  };
}

// ---- 配達者の管理(元: 配達者リストシートを直接編集していた) ---------------------------------

export async function dmListDrivers(): Promise<{ id: string; name: string; email: string }[]> {
  if (sheetConfigured()) return sheet.dmListDrivers();
  return db
    .select({ id: haisouDrivers.id, name: haisouDrivers.name, email: haisouDrivers.email })
    .from(haisouDrivers)
    .orderBy(asc(haisouDrivers.sortOrder), asc(haisouDrivers.createdAt));
}

function normalizeDriver(d: { name: string; email: string }) {
  const name = String(d.name ?? "").trim();
  const email = String(d.email ?? "").trim();
  if (!name) throw new UserError("名前を入力してください");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("メールアドレスの形が正しくありません");
  return { name, email };
}

export async function dmAddDriver(d: { name: string; email: string }): Promise<string> {
  const v = normalizeDriver(d);
  if (sheetConfigured()) return sheet.dmAddDriver(v);
  const [{ maxOrder }] = await db.select({ maxOrder: max(haisouDrivers.sortOrder) }).from(haisouDrivers);
  await db.insert(haisouDrivers).values({ ...v, sortOrder: (maxOrder ?? 0) + 1 });
  return `「${v.name}」を追加しました`;
}

export async function dmUpdateDriver(id: string, d: { name: string; email: string }): Promise<string> {
  const v = normalizeDriver(d);
  if (sheetConfigured()) return sheet.dmUpdateDriver(id, v);
  const rows = await db.update(haisouDrivers).set(v).where(eq(haisouDrivers.id, id)).returning({ id: haisouDrivers.id });
  if (!rows.length) throw new UserError("配達者が見つかりません。読み込み直してください。");
  return `「${v.name}」を変更しました`;
}

export async function dmDeleteDriver(id: string): Promise<string> {
  if (sheetConfigured()) return sheet.dmDeleteDriver(id);
  const rows = await db.delete(haisouDrivers).where(eq(haisouDrivers.id, id)).returning({ name: haisouDrivers.name });
  if (!rows.length) throw new UserError("配達者が見つかりません。読み込み直してください。");
  return `「${rows[0].name}」を削除しました(保存済みのルート表・履歴はそのまま残ります)`;
}

/** 並び順を 1 つ上下に動かす(ルート作成画面のプルダウンとカレンダーの色の順)。 */
export async function dmMoveDriver(id: string, dir: -1 | 1): Promise<string> {
  if (sheetConfigured()) return sheet.dmMoveDriver(id, dir);
  const list = await dmListDrivers();
  const i = list.findIndex((d) => d.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return "ok";
  [list[i], list[j]] = [list[j], list[i]];
  await db.transaction(async (tx) => {
    for (const [k, d] of list.entries()) {
      await tx.update(haisouDrivers).set({ sortOrder: k + 1 }).where(eq(haisouDrivers.id, d.id));
    }
  });
  return "ok";
}

/** 履歴画面の配達者の絞り込み用(配達者の一覧 + 履歴に出てくる名前)。 */
export async function listHistoryDrivers(): Promise<string[]> {
  if (sheetConfigured()) return sheet.listHistoryDrivers();
  const drivers = (await dmListDrivers()).map((d) => d.name);
  const rows = await db.selectDistinct({ driver: haisouHistory.driver }).from(haisouHistory);
  const extra = rows.map((r) => r.driver).filter((n) => n && !drivers.includes(n));
  return [...drivers, ...extra.sort()];
}
