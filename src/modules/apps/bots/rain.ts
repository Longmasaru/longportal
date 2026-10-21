// 雨予報の Bot の天気の読み取り(docs/DESIGN.md 39 章)。気象庁の天気予報の JSON(鍵なし)を使う。
// 読み取り(rainReport)は純粋関数にして、テストで形を確かめる。

const TIMEOUT_MS = 10_000;

/** 選べる地域(気象庁の府県予報区と一次細分区域)。会社のある石川県だけ。 */
export const RAIN_AREAS = [
  { code: "170010", office: "170000", label: "石川県 加賀(金沢・白山など)" },
  { code: "170020", office: "170000", label: "石川県 能登" },
] as const;
export type RainAreaCode = (typeof RAIN_AREAS)[number]["code"];

type JmaArea = { area?: { name?: string; code?: string }; weathers?: string[]; pops?: string[] };
type JmaTimeSeries = { timeDefines?: string[]; areas?: JmaArea[] };
type JmaForecast = { reportDatetime?: string; timeSeries?: JmaTimeSeries[] }[];

export type RainSlot = { hour: number; pop: number };
export type RainReport = {
  areaName: string;
  /** 今日の天気の文(「くもり 昼過ぎ から 雨」など)。ないときは空。 */
  weather: string;
  /** 今日の 6 時間ごとの降水確率(始まりの時)。発表の時刻より前の区切りは入らない。 */
  slots: RainSlot[];
  maxPop: number;
};

/** 気象庁の時刻(`2026-10-21T06:00:00+09:00`)から、JST の日付と時を取る。 */
function jstParts(time: string): { date: string; hour: number } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):/.exec(time);
  return m && time.endsWith("+09:00") ? { date: m[1], hour: Number(m[2]) } : null;
}

/** その地域の今日(JST の暦日)の降水確率と天気。今日の降水確率が 1 つもなければ null。 */
export function rainReport(data: unknown, areaCode: string, today: string): RainReport | null {
  if (!Array.isArray(data)) return null;
  const series = (data as JmaForecast)[0]?.timeSeries ?? [];
  let areaName = "";
  let weather = "";
  const slots: RainSlot[] = [];
  for (const ts of series) {
    const times = ts.timeDefines ?? [];
    const area = ts.areas?.find((a) => a.area?.code === areaCode);
    if (!area) continue;
    areaName ||= area.area?.name ?? "";
    times.forEach((time, i) => {
      const t = jstParts(time);
      if (!t || t.date !== today) return;
      if (area.weathers && !weather) weather = (area.weathers[i] ?? "").replace(/\s+/g, " ").trim();
      const pop = area.pops?.[i];
      if (pop !== undefined && /^\d{1,3}$/.test(pop)) slots.push({ hour: t.hour, pop: Number(pop) });
    });
  }
  if (slots.length === 0) return null;
  return { areaName, weather, slots, maxPop: Math.max(...slots.map((s) => s.pop)) };
}

/** 気象庁の府県の予報(JSON)を取る。 */
export async function fetchJmaForecast(office: string): Promise<unknown> {
  if (!/^\d{6}$/.test(office)) throw new Error("府県のコードが不正です。");
  const res = await fetch(`https://www.jma.go.jp/bosai/forecast/data/forecast/${office}.json`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  }).catch(() => {
    throw new Error("気象庁の予報を取れませんでした(つながりませんでした)");
  });
  if (!res.ok) throw new Error(`気象庁の予報を取れませんでした(${res.status})`);
  return res.json();
}
