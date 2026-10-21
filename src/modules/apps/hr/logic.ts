import { grantAllows, hasGlobalGrant, type Grant } from "@/modules/core/access/grants";
import { RECORD_VISIBILITIES, type RecordVisibility } from "./labels";

// 人事管理アプリの見え方の判定(DB・セッションに依存しない純粋関数)。docs/DESIGN.md 31 章。

/** 対象の社員の、今日有効な所属(拠点・部署)。 */
export type TargetAssignment = { locationId: string; departmentId: string };

/**
 * 他の社員のページを見て、記録を書けるか。
 * 全社の割当なら全員。拠点・部署つきの割当なら、対象の社員の今日の所属のどれかがスコープに当てはまるとき。
 */
export function canManageEmployee(grants: Grant[], code: string, assignments: TargetAssignment[]): boolean {
  if (hasGlobalGrant(grants, code)) return true;
  return assignments.some((a) => grantAllows(grants, code, a));
}

/**
 * 社員のページの見え方。self = 本人(公開の記録だけ・書けない)、supervisor = 上司(本人と同じ範囲・書けない。31.4)、
 * manager = 管理(すべて・書ける)、none = 見られない。
 */
export type PageMode = "self" | "supervisor" | "manager" | "none";

export function pageMode(
  viewerEmployeeId: string | null,
  targetEmployeeId: string,
  canManage: boolean,
  isSupervisor = false,
): PageMode {
  // 自分のページは、権限があっても本人と同じ見え方にする(自分についてのメモは見えず、書けない)。
  if (viewerEmployeeId === targetEmployeeId) return "self";
  if (canManage) return "manager";
  return isSupervisor ? "supervisor" : "none";
}

/** その見え方で見える記録の公開範囲。 */
export function visibilitiesFor(mode: PageMode): readonly RecordVisibility[] {
  if (mode === "manager") return RECORD_VISIBILITIES;
  if (mode === "supervisor") return ["employee", "supervisors"];
  if (mode === "self") return ["employee", "personal"];
  return [];
}

/** その見え方で、記録が見えるか。 */
export function recordVisibleTo(mode: PageMode, visibility: RecordVisibility): boolean {
  return visibilitiesFor(mode).includes(visibility);
}

/**
 * 記録を書ける公開範囲(31.4)。管理する人はすべて。上司は「本人に公開」「上司まで」だけ
 * (ほかを選ぶと、書いた上司自身も読めなくなるため)。本人は書けない。
 */
export function writableVisibilities(mode: PageMode): readonly RecordVisibility[] {
  if (mode === "manager") return RECORD_VISIBILITIES;
  if (mode === "supervisor") return ["employee", "supervisors"];
  return [];
}

/** 記録を直せる・消せるか。管理する人はすべて、上司は自分が書いて、まだ自分に見える記録だけ。 */
export function canEditRecord(
  mode: PageMode,
  record: { authorUserId: string | null; visibility: RecordVisibility },
  viewerUserId: string,
): boolean {
  if (mode === "manager") return true;
  return mode === "supervisor" && record.authorUserId === viewerUserId && writableVisibilities(mode).includes(record.visibility);
}

// ---- 上司と部下(31.4) ----

/** 社員 → 直属の上司(上司の指定がある社員だけ)。 */
export type SupervisorMap = ReadonlyMap<string, string>;

/** 上司から下にたどれる部下全員(直属とその下。本人は含まない)。 */
export function reportsOf(supervisorId: string, supervisors: SupervisorMap): Set<string> {
  const children = new Map<string, string[]>();
  for (const [employeeId, sup] of supervisors) {
    const list = children.get(sup) ?? [];
    list.push(employeeId);
    children.set(sup, list);
  }
  const result = new Set<string>();
  const queue = [supervisorId];
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (child === supervisorId || result.has(child)) continue;
      result.add(child);
      queue.push(child);
    }
  }
  return result;
}

/** employeeId の上司を supervisorId にすると、自分自身か輪になるか(上司の上をたどって employeeId に戻るか)。 */
export function wouldCreateCycle(employeeId: string, supervisorId: string, supervisors: SupervisorMap): boolean {
  const seen = new Set<string>();
  for (let cur: string | undefined = supervisorId; cur !== undefined; cur = supervisors.get(cur)) {
    if (cur === employeeId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
  }
  return false;
}

// ---- 人事管理シートの計算(31.1) ----

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

/** 満年齢(today 時点。誕生日の当日に 1 つ増える)。 */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = parts(birthDate);
  const [ty, tm, td] = parts(today);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** 勤続年数(入社日から today まで。満の年と月)。入社前は null。 */
export function tenureOn(hiredOn: string, today: string): { years: number; months: number } | null {
  if (today < hiredOn) return null;
  const [hy, hm, hd] = parts(hiredOn);
  const [ty, tm, td] = parts(today);
  const total = (ty - hy) * 12 + (tm - hm) - (td < hd ? 1 : 0);
  return { years: Math.floor(total / 12), months: total % 12 };
}

/** 有給の残日数と消化率(%、小数 1 桁)。付与日数がなければ null。 */
export function leaveSummary(
  granted: number | null,
  taken: number | null,
): { remaining: number; rate: number } | null {
  if (granted === null || granted <= 0) return null;
  const t = taken ?? 0;
  return { remaining: Math.round((granted - t) * 10) / 10, rate: Math.round((t / granted) * 1000) / 10 };
}

/** 前回 → 今回の変化(↑ 良くなった / → 同じ / ↓ 悪くなった)。どちらかがなければ null。値は大きいほど良い。 */
export function trend(prev: number | null | undefined, now: number | null | undefined): "up" | "flat" | "down" | null {
  if (prev === null || prev === undefined || now === null || now === undefined) return null;
  return now > prev ? "up" : now < prev ? "down" : "flat";
}

/**
 * レーダーチャートの i 番目の軸(全 count 本、真上から時計回り)で、値 value(0〜max)が描かれる点。
 * 中心 (cx, cy)、外周の半径 radius。小数第 1 位で丸める。
 */
export function radarPoint(
  i: number,
  count: number,
  value: number,
  max: number,
  radius: number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
  const r = (Math.min(Math.max(value, 0), max) / max) * radius;
  const round = (n: number) => Math.round(n * 10) / 10 + 0;
  return { x: round(cx + r * Math.cos(angle)), y: round(cy + r * Math.sin(angle)) };
}

/** 氏名の部品(漢字・かな)。null や空は無視する。 */
export type NameParts = {
  familyName: string;
  givenName: string | null;
  familyNameKana: string | null;
  givenNameKana: string | null;
};

const HONORIFIC = "(?:さん|くん|君|ちゃん|様|氏)?";

/**
 * AI に送る前に、対象の社員の氏名を「本人」に置き換える(31.3)。
 * 姓名続き(空白あり・なし)、姓だけ、名だけ(どれも 2 文字以上)を、敬称ごと置き換える。長いものから順に当てる。
 */
export function maskName(text: string, name: NameParts, replacement = "本人"): string {
  const pairs: [string, string | null][] = [
    [name.familyName, name.givenName],
    [name.familyNameKana ?? "", name.givenNameKana],
  ];
  const words = new Set<string>();
  for (const [family, given] of pairs) {
    const f = family.trim();
    const g = (given ?? "").trim();
    if (f && g) {
      words.add(`${f}${g}`);
      words.add(`${f} ${g}`);
      words.add(`${f}　${g}`);
    }
    if (f.length >= 2) words.add(f);
    if (g.length >= 2) words.add(g);
  }
  const sorted = [...words].sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return text;
  const escaped = sorted.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return text.replace(new RegExp(`(?:${escaped.join("|")})${HONORIFIC}`, "g"), replacement);
}
