// ルート表の時刻・リンクの計算(純粋関数。元の Apps Script の calcRoute / buildMapLinks_ と同じ計算)。
import { BREAKS, FALLBACK_LEG_MIN, HQ_LATLNG, MAX_LINK_WAYPOINTS, type Break } from "./constants";

export type Stop = {
  row: number;
  name: string;
  person: string;
  address: string;
  tel: string;
  kind?: string;
  latlng: string;
  yoken: string;
  detail: string;
  stay: number;
};

export type ScheduleEntry = {
  no: number;
  row: number;
  latlng: string;
  name: string;
  person: string;
  address: string;
  tel: string;
  yoken: string;
  detail: string;
  stay: number;
  travelMin: number;
  travelKm: number | null;
  arrive: string;
  depart: string;
  breaksCrossed: string[];
};

export type MapLink = { label: string; url: string };

/** 時刻を進める。休憩の中に入ったら休憩の終わりまで飛ばす(移動・滞在は休憩の間は止まる)。 */
export function advanceClock(
  start: number,
  minutes: number,
  breaks: readonly Break[] = BREAKS,
): { time: number; crossed: Break[] } {
  let cur = start;
  let remaining = minutes;
  const crossed: Break[] = [];
  for (;;) {
    const inBreak = breaks.find((b) => cur >= b.start && cur < b.end);
    if (inBreak) {
      crossed.push(inBreak);
      cur = inBreak.end;
      continue;
    }
    if (remaining <= 0) break;
    const next = breaks.filter((b) => b.start >= cur).sort((a, b) => a.start - b.start)[0];
    if (next && next.start < cur + remaining) {
      remaining -= next.start - cur;
      cur = next.start;
    } else {
      cur += remaining;
      remaining = 0;
    }
  }
  return { time: cur, crossed };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 分 → `HH:MM`(24 時を超えてもそのまま)。 */
export function formatClock(t: number): string {
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
}

/** `HH:MM` → 分。 */
export function parseClock(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * 区間ごとの秒・メートルから、区間の分(切り上げ)と km(小数 1 桁)を作る。
 * 経路が取れなかったとき(secs が null)は、どの区間も 15 分の概算にする。
 */
export function legsFrom(
  count: number,
  secs: number[] | null,
  meters: number[] | null,
): { legMins: number[]; legKm: (number | null)[]; totalMin: number; totalKm: number | null } {
  const legMins: number[] = [];
  const legKm: (number | null)[] = [];
  for (let i = 0; i <= count; i++) {
    legMins.push(secs ? Math.ceil(secs[i] / 60) : FALLBACK_LEG_MIN);
    legKm.push(meters ? Math.round(meters[i] / 100) / 10 : null);
  }
  const totalMin = legMins.reduce((a, b) => a + b, 0);
  const totalKm = meters ? Math.round(meters.reduce((a, b) => a + b, 0) / 100) / 10 : null;
  return { legMins, legKm, totalMin, totalKm };
}

/** 並べた配達先から、到着・出発の時刻と、会社への帰着時刻を出す。 */
export function buildSchedule(
  ordered: Stop[],
  startTime: string,
  legMins: number[],
  legKm: (number | null)[],
): { schedule: ScheduleEntry[]; backTime: string } {
  let clock = parseClock(startTime);
  const schedule: ScheduleEntry[] = [];
  ordered.forEach((s, i) => {
    const travel = advanceClock(clock, legMins[i]);
    clock = travel.time;
    const arrive = clock;
    const stay = advanceClock(clock, s.stay);
    clock = stay.time;
    schedule.push({
      no: i + 1,
      row: s.row,
      latlng: s.latlng || "",
      name: s.name,
      person: s.person,
      address: s.address,
      tel: s.tel,
      yoken: s.yoken || "納品",
      detail: s.detail || "",
      stay: s.stay,
      travelMin: legMins[i],
      travelKm: legKm[i],
      arrive: formatClock(arrive),
      depart: formatClock(clock),
      breaksCrossed: travel.crossed.concat(stay.crossed).map((b) => b.label),
    });
  });
  clock = advanceClock(clock, legMins[ordered.length]).time;
  return { schedule, backTime: formatClock(clock) };
}

/** Google マップのルートのリンク。経由地は 1 本に 9 件まで、超えたら分けて続ける。 */
export function buildMapLinks(locs: string[], avoidHighways: boolean): MapLink[] {
  const enc = encodeURIComponent;
  const base =
    "https://www.google.com/maps/dir/?api=1&travelmode=driving" + (avoidHighways ? "&avoid=highways" : "");
  const links: MapLink[] = [];
  let origin = HQ_LATLNG;
  let rest = locs.slice();
  let part = 1;
  while (rest.length > 0) {
    const isLast = rest.length <= MAX_LINK_WAYPOINTS + 1;
    const chunk = isLast ? rest : rest.slice(0, MAX_LINK_WAYPOINTS + 1);
    rest = isLast ? [] : rest.slice(MAX_LINK_WAYPOINTS + 1);
    const dest = isLast ? HQ_LATLNG : chunk[chunk.length - 1];
    const wps = isLast ? chunk : chunk.slice(0, -1);
    links.push({
      label: locs.length > MAX_LINK_WAYPOINTS + 1 ? `ルート ${part}` : "Googleマップでルートを開く",
      url:
        base +
        "&origin=" +
        enc(origin) +
        "&destination=" +
        enc(dest) +
        (wps.length ? "&waypoints=" + enc(wps.join("|")) : ""),
    });
    origin = dest;
    part++;
  }
  return links;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** `YYYY-MM-DD` → `2026年9月8日(火)`。 */
export function formatDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const w = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}年${m}月${d}日(${w})`;
}

/** `2026年9月8日(火)` や `2026/9/8`、`2026-09-08` → `YYYY-MM-DD`(読めなければ null)。 */
export function parseDateLabel(label: string): string | null {
  const m = String(label).match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/** `36.6,136.6` のような文字列を、緯度・経度に分ける(読めなければ null)。 */
export function parseLatLng(s: string): { latitude: number; longitude: number } | null {
  const m = String(s).trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  return m ? { latitude: Number(m[1]), longitude: Number(m[2]) } : null;
}
