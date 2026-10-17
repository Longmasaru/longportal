// ありがとう番付の決まり(docs/DESIGN.md 26 章)。DB に依存しない純粋な関数だけを置く。
import { addDays, weekRange } from "./constants";

/** 位。上から順。maezumo = 前相撲(番付に載る前)。 */
export const RANKS = [
  "yokozuna",
  "ozeki",
  "sekiwake",
  "komusubi",
  "maegashira",
  "juryo",
  "makushita",
  "jonokuchi",
  "maezumo",
] as const;
export type Rank = (typeof RANKS)[number];

export const RANK_LABEL: Record<Rank, string> = {
  yokozuna: "横綱",
  ozeki: "大関",
  sekiwake: "関脇",
  komusubi: "小結",
  maegashira: "前頭",
  juryo: "十両",
  makushita: "幕下",
  jonokuchi: "序ノ口",
  maezumo: "前相撲",
};

export type Side = "east" | "west";

/** 白星がいくつで「位が上がる目安」か(勝ち越し)。 */
export const KACHIKOSHI = 8;

/** 伝達式の口上に入れる四字熟語。 */
export const KOJO_WORDS = [
  { word: "一枚入魂", reading: "いちまいにゅうこん" },
  { word: "段取八分", reading: "だんどりはちぶ" },
  { word: "感謝感激", reading: "かんしゃかんげき" },
  { word: "曲直一貫", reading: "きょくちょくいっかん" },
  { word: "溶接一心", reading: "ようせついっしん" },
  { word: "不撓不屈", reading: "ふとうふくつ" },
] as const;

export function kojoText(word: string, rank: Rank): string {
  return `謹んでお受けいたします。${RANK_LABEL[rank]}の名に恥じぬよう、${word}の精神で精進いたします。`;
}

// ---------- 場所 ----------

const BASHO_NAMES: Record<number, string> = {
  1: "初場所",
  3: "春場所",
  5: "夏場所",
  7: "名古屋場所",
  9: "秋場所",
  11: "九州場所",
};

export type Basho = {
  /** 場所の最初の月(`YYYY-MM`)。奇数月。 */
  key: string;
  name: string;
  /** 和暦の年つきの名前(例: 令和八年九州場所)。 */
  fullName: string;
  start: string;
  end: string;
};

const KANJI_DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 1〜99 を漢数字に(十・二十…の読み方で)。 */
export function kanjiNumber(n: number): string {
  if (n <= 0 || n >= 100 || !Number.isInteger(n)) return String(n);
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${tens === 0 ? "" : tens === 1 ? "十" : KANJI_DIGITS[tens] + "十"}${ones === 0 ? "" : KANJI_DIGITS[ones]}`;
}

export function bashoFromKey(key: string): Basho {
  const [y, m] = key.split("-").map(Number);
  const endMonth = new Date(Date.UTC(y, m + 1, 0)); // 翌月の末日
  const reiwa = y - 2018;
  const name = BASHO_NAMES[m];
  return {
    key,
    name,
    fullName: `令和${reiwa === 1 ? "元" : kanjiNumber(reiwa)}年${name}`,
    start: `${key}-01`,
    end: endMonth.toISOString().slice(0, 10),
  };
}

/** その日(`YYYY-MM-DD`)を含む場所。 */
export function bashoOf(date: string): Basho {
  const [y, m] = date.split("-").map(Number);
  const startMonth = m % 2 === 1 ? m : m - 1;
  return bashoFromKey(`${y}-${String(startMonth).padStart(2, "0")}`);
}

/** 前の場所。 */
export function prevBasho(key: string): Basho {
  return bashoOf(addDays(`${key}-01`, -1));
}

/** 場所の週(月曜はじまり)。場所の初日・千秋楽をまたぐ週も 1 週と数え、場所の中の日だけを範囲にする。 */
export function bashoWeeks(basho: Basho): { start: string; end: string }[] {
  const weeks: { start: string; end: string }[] = [];
  let monday = weekRange(basho.start).start;
  while (monday <= basho.end) {
    const sunday = addDays(monday, 6);
    weeks.push({ start: monday < basho.start ? basho.start : monday, end: sunday > basho.end ? basho.end : sunday });
    monday = addDays(monday, 7);
  }
  return weeks;
}

// ---------- 四股名 ----------

/** 姓から作る四股名の候補。 */
export function shikonaCandidates(familyName: string): string[] {
  const f = familyName.trim();
  if (!f) return [];
  return [`${f}乃海`, `${f}錦`, `${f}富士`, `${f}山`, `${f}龍`, `若${f}`];
}

// ---------- 番付の編成 ----------

export type PrevEntry = {
  userId: string;
  /** 前の場所の位置(1 = いちばん上)。 */
  position: number;
  rank: Rank;
  /** 前の場所の白星。 */
  wins: number;
  /** 前の場所にもらったカード(懸賞)。 */
  received: number;
  /** その前の場所で、大関として優勝していたか(横綱への条件)。 */
  ozekiYushoBefore: boolean;
};

export type NewEntry = {
  userId: string;
  position: number;
  rank: Rank;
  side: Side;
  /** 新しく大関・横綱に上がった(伝達式の対象)。 */
  promoted: boolean;
};

/** 前の場所の優勝者(白星 1 つ以上で最多。並んだら懸賞、さらに並んだら前の位置が上の人)。いなければ null。 */
export function findYusho(entries: Pick<PrevEntry, "userId" | "position" | "wins" | "received">[]): string | null {
  const sorted = [...entries].sort((a, b) => b.wins - a.wins || b.received - a.received || a.position - b.position);
  const top = sorted[0];
  return top && top.wins > 0 ? top.userId : null;
}

/** 位の枠: 関脇 2・小結 2・残りの 3 割を前頭・3 割を十両・2 割 5 分を幕下・残りを序ノ口。 */
export function poolRanks(n: number): Rank[] {
  const ranks: Rank[] = [];
  const take = (rank: Rank, count: number) => {
    for (let i = 0; i < count && ranks.length < n; i++) ranks.push(rank);
  };
  take("sekiwake", 2);
  take("komusubi", 2);
  const rest = Math.max(n - 4, 0);
  take("maegashira", Math.ceil(rest * 0.3));
  take("juryo", Math.ceil(rest * 0.3));
  take("makushita", Math.ceil(rest * 0.25));
  take("jonokuchi", n);
  return ranks;
}

/**
 * 前の場所の番付と結果から、次の場所の番付を作る。
 * - 前の場所の番付にいない在籍者(`newcomers`、並べたい順)は前相撲でいちばん下。
 * - 前の場所の番付にいて、いまは在籍していない人(`activeIds` にない)は外す。
 * - 前の番付が空(最初の場所)なら、全員が前相撲。
 */
export function computeNextBanzuke(prev: PrevEntry[], newcomers: string[], activeIds: Set<string>): NewEntry[] {
  const yusho = findYusho(prev);
  const current = prev.filter((e) => activeIds.has(e.userId));

  const yokozuna: { e: PrevEntry; promoted: boolean }[] = [];
  const ozeki: { e: PrevEntry; promoted: boolean }[] = [];
  const pool: { e: PrevEntry; key: number }[] = [];

  // 前相撲の人は、全員が同じところ(番付に載っている人のすぐ下)から動く。
  const maezumoBase = Math.max(0, ...current.filter((e) => e.rank !== "maezumo").map((e) => e.position)) + 1;
  for (const e of current) {
    const base = e.rank === "maezumo" ? maezumoBase : e.position;
    const won = e.userId === yusho;
    if (e.rank === "yokozuna") yokozuna.push({ e, promoted: false });
    else if (e.rank === "ozeki" && won && e.ozekiYushoBefore) yokozuna.push({ e, promoted: true });
    else if (e.rank === "ozeki" && e.wins >= KACHIKOSHI) ozeki.push({ e, promoted: false });
    else if (e.rank !== "ozeki" && won) ozeki.push({ e, promoted: true });
    else if (e.rank === "ozeki") pool.push({ e, key: -Infinity }); // 大関から陥落: 関脇のいちばん上
    else pool.push({ e, key: base - (e.wins - (KACHIKOSHI - 0.5)) * 2 });
  }

  const byPosition = (a: { e: PrevEntry }, b: { e: PrevEntry }) => a.e.position - b.e.position;
  // 昇進したばかりの人は、もとからの同じ位の人の下に置く。
  const byStay = (a: { e: PrevEntry; promoted: boolean }, b: { e: PrevEntry; promoted: boolean }) =>
    Number(a.promoted) - Number(b.promoted) || a.e.position - b.e.position;
  yokozuna.sort(byStay);
  ozeki.sort(byStay);
  pool.sort((a, b) => a.key - b.key || b.e.wins - a.e.wins || byPosition(a, b));

  const ordered: { userId: string; rank: Rank; promoted: boolean }[] = [
    ...yokozuna.map((x) => ({ userId: x.e.userId, rank: "yokozuna" as Rank, promoted: x.promoted })),
    ...ozeki.map((x) => ({ userId: x.e.userId, rank: "ozeki" as Rank, promoted: x.promoted })),
  ];
  const poolRankList = poolRanks(pool.length);
  pool.forEach((x, i) => ordered.push({ userId: x.e.userId, rank: poolRankList[i], promoted: false }));
  const known = new Set(ordered.map((o) => o.userId));
  for (const id of newcomers) {
    if (!known.has(id)) ordered.push({ userId: id, rank: "maezumo", promoted: false });
  }

  // 同じ位の中で、上から東・西・東…
  const seen = new Map<Rank, number>();
  return ordered.map((o, i) => {
    const k = seen.get(o.rank) ?? 0;
    seen.set(o.rank, k + 1);
    return { ...o, position: i + 1, side: k % 2 === 0 ? "east" : "west" };
  });
}
