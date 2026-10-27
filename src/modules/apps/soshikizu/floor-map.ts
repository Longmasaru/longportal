// 会社配置図(組織図アプリの「配置図」タブ)。建物・機械・「よくいる場所」をコードで持つ(DB の変更なし)。
// 元は Google ドライブ「会社配置図_2026-10-23(A3横).html」(老川さんの清書を写したもの)。座標はその A3 横の図の mm。
// 配置が変わったら、ここを直す。docs/DESIGN.md 36 章。
import type { OrgMember } from "./types";

export const FLOOR_MAP_AS_OF = "2026-10-23";

/** 図の大きさ(mm)。元の図の右の余白と「見方」は、画面では図の外に出す。 */
export const FLOOR_MAP_SIZE = { width: 316, height: 290 } as const;

export type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

/** rect の中の、左上からの割合(%)の点。 */
function at(r: Rect, px: number, py: number): Point {
  return { x: r.x + (r.w * px) / 100, y: r.y + (r.h * py) / 100 };
}

/** rect の中の、左上からの割合(%)の四角。 */
function part(r: Rect, px: number, py: number, pw: number, ph: number): Rect {
  return { x: r.x + (r.w * px) / 100, y: r.y + (r.h * py) / 100, w: (r.w * pw) / 100, h: (r.h * ph) / 100 };
}

const KOJO1: Rect = { x: 12, y: 84, w: 86, h: 202 };
const OFFICE = part(KOJO1, 0, 0, 74, 25);
const GIJUTSU = part(KOJO1, 0, 29, 62, 17);
const KOJO2: Rect = { x: 113, y: 30, w: 88, h: 48 };
const KOJO3: Rect = { x: 113, y: 82, w: 88, h: 52 };
const SOKO: Rect = { x: 128, y: 134, w: 73, h: 72 };
const KOJO4: Rect = { x: 110, y: 210, w: 91, h: 76 };
const B_AWAY: Rect = { x: 222, y: 30, w: 90, h: 88 };
const B_BLD: Rect = { x: 228, y: 45, w: 78, h: 67 };
const NIGO_AWAY: Rect = { x: 222, y: 126, w: 90, h: 88 };
const NIGO_BLD: Rect = { x: 228, y: 141, w: 78, h: 67 };
const DRIVER: Rect = { x: 136, y: 4, w: 70, h: 22 };

export type AreaKey = "office" | "gijutsu" | "kojo1" | "kojo2" | "kojo3" | "soko" | "kojo4" | "b" | "nigo" | "driver";

export type FloorArea = {
  key: AreaKey;
  /** 名簿の見出しに使う名前。 */
  name: string;
  /** 押せる範囲(建物の外枠)。 */
  rect: Rect;
  /** 図に書く名前(なければ書かない)と、その仕事。 */
  title?: { text: string; kana?: string; at: Point; size: number };
  work?: { text: string; at: Point };
  /** 本社から離れた場所(点線の枠)。 */
  away?: Rect;
  /** 枠を書かない場所(運転手)。 */
  open?: boolean;
};

/** 名簿の並び順でもある。部屋(事務所・技術部)は、それを含む第 1 工場より後に書くので、上に重なって押せる。 */
export const FLOOR_AREAS: FloorArea[] = [
  {
    key: "kojo1",
    name: "第1工場",
    rect: KOJO1,
    title: { text: "第①工場", kana: "だいいちこうじょう", at: at(KOJO1, 43, 69), size: 7 },
    work: { text: "ブレーキ", at: at(KOJO1, 43, 76) },
  },
  {
    key: "office",
    name: "事務所",
    rect: OFFICE,
    title: { text: "事務所", kana: "じむしょ", at: at(OFFICE, 84, 86), size: 4.2 },
  },
  {
    key: "gijutsu",
    name: "技術部",
    rect: GIJUTSU,
    title: { text: "技術部", kana: "ぎじゅつぶ", at: at(GIJUTSU, 50, 10), size: 3.6 },
  },
  {
    key: "kojo2",
    name: "第2工場",
    rect: KOJO2,
    title: { text: "第②工場", kana: "だいにこうじょう", at: at(KOJO2, 78, 31), size: 7 },
    work: { text: "レーザー", at: at(KOJO2, 13, 16) },
  },
  {
    key: "kojo3",
    name: "第3工場",
    rect: KOJO3,
    title: { text: "第③工場", kana: "だいさんこうじょう", at: at(KOJO3, 47, 46), size: 7 },
    work: { text: "溶接", at: at(KOJO3, 47, 64) },
  },
  {
    key: "soko",
    name: "倉庫(出荷管理)",
    rect: SOKO,
    title: { text: "倉庫", kana: "そうこ", at: at(SOKO, 32, 40), size: 8 },
    work: { text: "出荷管理", at: at(SOKO, 32, 54) },
  },
  {
    key: "kojo4",
    name: "第4工場",
    rect: KOJO4,
    title: { text: "第④工場", kana: "だいよんこうじょう", at: at(KOJO4, 50, 46), size: 7 },
    work: { text: "溶接", at: at(KOJO4, 50, 61) },
  },
  {
    key: "b",
    name: "B工場",
    rect: B_BLD,
    away: B_AWAY,
    title: { text: "B工場", at: { x: B_AWAY.x + 4, y: B_AWAY.y + 8 }, size: 6.5 },
    work: { text: "レーザー", at: at(B_BLD, 50, 47) },
  },
  {
    key: "nigo",
    name: "2号店",
    rect: NIGO_BLD,
    away: NIGO_AWAY,
    title: { text: "2号店", at: { x: NIGO_AWAY.x + 4, y: NIGO_AWAY.y + 8 }, size: 6.5 },
    work: { text: "溶接", at: at(NIGO_BLD, 30, 49) },
  },
  { key: "driver", name: "運転手(配送)", rect: DRIVER, open: true },
];

/** 機械(斜線の四角)。dashed は清書で点線だったもの。 */
export const FLOOR_MACHINES: { rect: Rect; label: string; dashed?: boolean }[] = [
  { rect: part(KOJO2, 24, 4, 32, 13), label: "ENSIS" },
  { rect: part(KOJO2, 60, 46, 35, 24), label: "ACIES", dashed: true },
  { rect: part(B_BLD, 10, 8, 60, 18), label: "EML" },
];

/** 出入口(建物の左の辺の太線)。 */
export const FLOOR_DOORS: Rect[] = [part(KOJO2, 0, 20, 0, 40), part(SOKO, 0, 15, 0, 30), part(KOJO4, 0, 12, 0, 45)];

/** トイレ。 */
export const FLOOR_WCS: Rect[] = [{ x: 3.5, y: 131, w: 8.5, h: 14 }, part(KOJO4, 0, 85, 11, 15)];

/** 清書に点線の丸だけが描いてあった所(中身は書いていない)。 */
export const FLOOR_MARKS: Point[] = [at(KOJO4, 35.5, 89)];

/** 運転手のトラックの絵の位置(左上)。 */
export const FLOOR_TRUCK: Point = { x: 140, y: 7 };

export type SeatWho = { family: string; given?: string } | { full: string };

export type FloorSeat = {
  area: AreaKey;
  at: Point;
  /** 図に書く名前(名字。ベトナムの人は呼び名のローマ字)と、ふりがな。 */
  label: string;
  yomi: string;
  /** リーダー・役員(lead)とサブリーダー(sub)。 */
  role?: { label: string; kind: "lead" | "sub" };
  /** ポータルの社員への当て方。名字だけのときは、名字が 1 人に決まる場合だけ当てる。 */
  who: SeatWho;
};

type SeatSpec = [px: number, py: number, label: string, yomi: string, who: SeatWho, role?: FloorSeat["role"]];

const LEAD = (label: string) => ({ label, kind: "lead" as const });
const SUB = { label: "サブリーダー", kind: "sub" as const };
const fam = (family: string, given?: string): SeatWho => (given ? { family, given } : { family });

function seats(area: AreaKey, rect: Rect, specs: SeatSpec[]): FloorSeat[] {
  return specs.map(([px, py, label, yomi, who, role]) => ({ area, at: at(rect, px, py), label, yomi, who, role }));
}

export const FLOOR_SEATS: FloorSeat[] = [
  ...seats("office", OFFICE, [
    [17, 19, "長井 隆", "ながい", fam("長井", "隆"), LEAD("常務")],
    [48, 19, "平口", "ひらぐち", fam("平口"), LEAD("工場長")],
    [13.5, 51, "老川", "おいかわ", fam("老川")],
    [38, 51, "長井 将", "ながい", fam("長井", "将")],
    [61, 51, "長井 晃", "ながい", fam("長井", "晃"), LEAD("専務")],
    [86, 48, "大坪", "おおつぼ", fam("大坪")],
    [13.5, 82, "松本", "まつもと", fam("松本")],
    [45, 82, "長井 勉", "ながい", fam("長井", "勉"), LEAD("社長")],
  ]),
  ...seats("gijutsu", GIJUTSU, [
    [17, 24, "成岡", "なりおか", fam("成岡")],
    [83, 24, "針田", "はりた", fam("針田")],
    [50, 50, "金森", "かなもり", fam("金森")],
    [17, 78, "谷口", "たにぐち", fam("谷口"), LEAD("リーダー")],
    [50, 78, "米澤", "よねざわ", fam("米澤")],
    [83, 78, "南", "みなみ", fam("南")],
  ]),
  ...seats("kojo1", KOJO1, [
    [78, 28, "無量江", "むりょうえ", fam("無量江")],
    [89, 20, "上田", "うえだ", fam("上田"), SUB],
    [89, 37, "八尾", "やつお", fam("八尾")],
    [89, 47, "佐野", "さの", fam("佐野")],
    [89, 58, "THANH", "タイン", { full: "VU NAM THANH" }],
    [89, 69, "SON", "ソン", { full: "MAI VAN SON" }],
    [45, 52, "稲荷", "いなり", fam("稲荷"), LEAD("リーダー")],
    [12, 58, "辻田", "つじた", fam("辻田")],
    [24, 95, "HIEN", "ヒエン", { full: "TRAN THI HIEN" }],
    [50, 95.5, "米村", "よねむら", fam("米村")],
    [76, 95, "HANH", "ハイン", { full: "PHAM THI HANH" }],
  ]),
  ...seats("kojo2", KOJO2, [
    [40, 35, "高瀬", "たかせ", fam("高瀬")],
    [20, 62, "室住", "むろずみ", fam("室住")],
    [54, 86, "釈迦院", "しゃかいん", fam("釈迦院"), LEAD("ブランク部リーダー")],
  ]),
  ...seats("kojo3", KOJO3, [
    [10, 15, "塩谷", "しおたに", fam("塩谷")],
    [28.5, 15, "TAI", "タイ", { full: "DING BAT TAI" }],
    [48, 15, "TIEN", "ティエン", { full: "PHAN BA TIEN" }],
    [68, 15, "HOANG", "ホアン", { full: "PHAN DINH HOANG" }],
    [88, 15, "THUONG", "トゥオン", { full: "THAN THI THUONG" }],
    [13, 84, "太田", "おおた", fam("太田"), LEAD("リーダー")],
    [48, 86, "LANH", "ライン", { full: "NGUYEN VAN LANH" }],
    [68, 86, "PHUONG", "フォン", { full: "DAO VAN PHUONG" }],
    [88, 86, "TRIEN", "チェン", { full: "DUONG MINH TRIEN" }],
  ]),
  ...seats("soko", SOKO, [
    [74, 13, "橋本", "はしもと", fam("橋本")],
    [74, 31, "VAN", "ヴァン", { full: "PHAM THI VAN" }],
    [74, 50, "QUANG", "クアン", { full: "DUONG THE QUANG" }],
    [74, 69, "THANH PHUONG", "タイン・フォン", { full: "BUI THANH PHUONG" }],
    [18, 88, "川井", "かわい", fam("川井")],
    [52, 87, "田村", "たむら", fam("田村"), LEAD("出荷管理部リーダー")],
  ]),
  ...seats("kojo4", KOJO4, [
    [36, 12, "椿下", "つばきした", fam("椿下"), SUB],
    [61, 11, "越野", "こしの", fam("越野")],
    [85, 11, "川畑", "かわばた", fam("川畑")],
    [21, 89, "HUNG", "フン", { full: "CAO MANH HUNG" }],
    [48, 90, "徳田", "とくだ", fam("徳田")],
    [66.5, 90, "山﨑", "やまざき", fam("山﨑")],
    [87.5, 90, "垂水", "たるみず", fam("垂水")],
  ]),
  ...seats("b", B_BLD, [[40, 79, "野沢", "のざわ", fam("野沢")]]),
  ...seats("nigo", NIGO_BLD, [
    [58, 20, "林", "はやし", fam("林")],
    [62, 79, "杉本", "すぎもと", fam("杉本"), SUB],
  ]),
  { area: "driver", at: { x: 178, y: 15 }, label: "竹下", yomi: "たけした", who: fam("竹下") },
  { area: "driver", at: { x: 195, y: 15 }, label: "藤井", yomi: "ふじい", who: fam("藤井") },
];

/** 名前の比べ方: 全角・半角や空白の違いを無視し、英字は大文字にそろえる。 */
export function normalizeSeatName(value: string): string {
  return value.normalize("NFKC").replace(/\s/g, "").toUpperCase();
}

type NameParts = Pick<OrgMember, "employeeId" | "familyName" | "givenName">;

/** 札 1 枚に当たる社員(1 人に決まらなければ null)。 */
export function findSeatMember<M extends NameParts>(who: SeatWho, members: readonly M[]): M | null {
  const hit =
    "full" in who
      ? members.filter((m) => normalizeSeatName(`${m.familyName}${m.givenName ?? ""}`) === normalizeSeatName(who.full))
      : members.filter(
          (m) =>
            normalizeSeatName(m.familyName) === normalizeSeatName(who.family) &&
            (who.given === undefined || normalizeSeatName(m.givenName ?? "") === normalizeSeatName(who.given)),
        );
  return hit.length === 1 ? hit[0] : null;
}

export type PlacedSeat<M> = FloorSeat & { index: number; member: M | null };

/**
 * 配置図の札に社員を当てる。同じ人に 2 枚が当たったら、先の札だけに当てる。
 * unplaced は、名簿(組織図に載る在籍者)にいるのに配置図に札がない人。
 */
export function placeSeats<M extends NameParts>(
  seatList: readonly FloorSeat[],
  members: readonly M[],
): { seats: PlacedSeat<M>[]; unplaced: M[] } {
  const used = new Set<string>();
  const placed = seatList.map((s, index) => {
    const m = findSeatMember(s.who, members);
    if (!m || used.has(m.employeeId)) return { ...s, index, member: null };
    used.add(m.employeeId);
    return { ...s, index, member: m };
  });
  return { seats: placed, unplaced: members.filter((m) => !used.has(m.employeeId)) };
}

/** 図の上の点がどの場所か(部屋 → 建物の順に見る)。どこでもなければ null。 */
export function areaAt(p: Point): AreaKey | null {
  for (const a of [...FLOOR_AREAS].reverse()) {
    const r = a.rect;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return a.key;
  }
  return null;
}

export const isAreaKey = (v: string): v is AreaKey => FLOOR_AREAS.some((a) => a.key === v);

/** 管理者が動かした場所(soshikizu.seat_positions の行)。 */
export type SeatOverride = { employeeId: string; area: AreaKey; x: number; y: number };

type KanaParts = NameParts & Pick<OrgMember, "nameKana">;

/** 札のない人を地図に置くときの、札の名前とふりがな(日本の人は名字、英字の人は名)。 */
export function seatLabelOf(m: KanaParts): { label: string; yomi: string } {
  const latin = /^[\x20-\x7e]+$/.test(m.familyName);
  const kana = (m.nameKana ?? "").split(/[\s　]+/).filter(Boolean);
  return latin
    ? { label: m.givenName ?? m.familyName, yomi: kana.at(-1)?.split("・").at(-1) ?? "" }
    : { label: m.familyName, yomi: kana[0] ?? "" };
}

/**
 * 動かした場所をかぶせる。札のある人はその札を動かし、札のない人には新しい札を足す(unplaced から外す)。
 * moved は、管理者が動かした(元に戻せる)札。
 */
export function applySeatOverrides<M extends KanaParts>(
  placed: { seats: PlacedSeat<M>[]; unplaced: M[] },
  overrides: readonly SeatOverride[],
): { seats: (PlacedSeat<M> & { moved: boolean })[]; unplaced: M[] } {
  const byId = new Map(overrides.map((o) => [o.employeeId, o]));
  const seatsOut = placed.seats.map((s) => {
    const o = s.member ? byId.get(s.member.employeeId) : undefined;
    return o ? { ...s, area: o.area, at: { x: o.x, y: o.y }, moved: true } : { ...s, moved: false };
  });
  const unplaced: M[] = [];
  for (const m of placed.unplaced) {
    const o = byId.get(m.employeeId);
    if (!o) {
      unplaced.push(m);
      continue;
    }
    seatsOut.push({
      ...seatLabelOf(m),
      area: o.area,
      at: { x: o.x, y: o.y },
      who: { full: `${m.familyName}${m.givenName ?? ""}` },
      index: seatsOut.length,
      member: m,
      moved: true,
    });
  }
  return { seats: seatsOut, unplaced };
}
