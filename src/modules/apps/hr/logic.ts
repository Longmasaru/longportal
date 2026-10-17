import { grantAllows, hasGlobalGrant, type Grant } from "@/modules/core/access/grants";
import type { RecordVisibility } from "./labels";

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

/** 社員のページの見え方。self = 本人(公開の記録だけ・書けない)、manager = 管理(すべて・書ける)、none = 見られない。 */
export type PageMode = "self" | "manager" | "none";

export function pageMode(viewerEmployeeId: string | null, targetEmployeeId: string, canManage: boolean): PageMode {
  // 自分のページは、権限があっても本人と同じ見え方にする(自分についてのメモは見えず、書けない)。
  if (viewerEmployeeId === targetEmployeeId) return "self";
  return canManage ? "manager" : "none";
}

/** その見え方で、記録が見えるか。 */
export function recordVisibleTo(mode: PageMode, visibility: RecordVisibility): boolean {
  if (mode === "manager") return true;
  if (mode === "self") return visibility === "employee";
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
