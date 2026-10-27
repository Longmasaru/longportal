import { diffDays } from "@/modules/core/shared/date";
import { EXPIRY_WARN_DAYS } from "./constants";
import type { NakamaMember } from "./types";

// 名簿の判定・計算(純粋関数)。docs/DESIGN.md 43 章。

/**
 * 名簿に載せる在籍者か。ログインの在籍判定(core/access の evaluate)と同じ考え方:
 * 人事上の状態が active / leave で、基準日に入社済み、最終在籍日を過ぎていない。
 */
export function isOnRoster(e: { hiredOn: string; leftOn: string | null; status: string }, today: string): boolean {
  if (e.status !== "active" && e.status !== "leave") return false;
  if (e.hiredOn > today) return false;
  return e.leftOn === null || e.leftOn >= today;
}

/** その日から数えて「○年目」(その日に 1 年目、1 年たった日から 2 年目)。まだ来ていない日なら null。 */
export function yearOrdinal(since: string | null, today: string): number | null {
  if (!since || since > today) return null;
  const [sy, sm, sd] = since.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let years = ty - sy;
  if (tm < sm || (tm === sm && td < sd)) years -= 1;
  return years + 1;
}

/**
 * 探すための文字の正規化: ひらがな → カタカナ、ベトナム語の記号(声調・ă・ơ など)を外す、đ → d、小文字、空白・中黒を外す。
 * 「あん」でも「アン」でも「nguyen」でも見つかるようにする。
 */
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s・･]/g, "");
}

/** 呼び名・氏名・フリガナ・ベトナム語の名前・社員番号のどれかに、言葉が含まれる人。言葉が空ならそのまま。 */
export function filterMembers(members: readonly NakamaMember[], q: string, departmentId: string | null): NakamaMember[] {
  const word = normalizeForSearch(q);
  return members.filter((m) => {
    if (departmentId && m.departmentId !== departmentId) return false;
    if (!word) return true;
    return [m.nickname, m.name, m.nameKana ?? "", m.nativeName, m.employeeNumber].some((s) =>
      normalizeForSearch(s).includes(word),
    );
  });
}

/** 並び順: 部署の表示順(所属なしは最後)→ 日本に来た日が早い順(未入力は後)→ 入社が早い順 → 社員番号。 */
export function compareMembers(a: NakamaMember, b: NakamaMember): number {
  const ad = a.departmentSortOrder ?? Number.MAX_SAFE_INTEGER;
  const bd = b.departmentSortOrder ?? Number.MAX_SAFE_INTEGER;
  if (ad !== bd) return ad - bd;
  if ((a.departmentName ?? "") !== (b.departmentName ?? "")) return (a.departmentName ?? "").localeCompare(b.departmentName ?? "");
  const aa = a.arrivedOn ?? "9999-12-31";
  const ba = b.arrivedOn ?? "9999-12-31";
  if (aa !== ba) return aa < ba ? -1 : 1;
  if (a.hiredOn !== b.hiredOn) return a.hiredOn < b.hiredOn ? -1 : 1;
  return a.employeeNumber < b.employeeNumber ? -1 : a.employeeNumber > b.employeeNumber ? 1 : 0;
}

/** 札に大きく出す名前(呼び名がなければ、名、それもなければ氏名)。 */
export function displayName(m: Pick<NakamaMember, "nickname" | "name">): string {
  return m.nickname.trim() || m.name;
}

/**
 * A4 縦 1 枚に全員を収める並べ方(列数・行数)。札がなるべく大きく、正方形に近くなる列数を選ぶ。
 * 印刷できる範囲は 190mm × 277mm(余白 10mm)。見出し(15mm)と、はみ出して 2 枚目にならないためのゆとりを引いた範囲に並べる。
 */
export const PRINT_AREA = { width: 190, height: 255 } as const;

export function printGrid(count: number): { columns: number; rows: number } {
  if (count <= 0) return { columns: 1, rows: 1 };
  const W = PRINT_AREA.width;
  const H = PRINT_AREA.height;
  let best = { columns: 1, rows: count, size: 0 };
  for (let columns = 1; columns <= Math.min(count, 8); columns++) {
    const rows = Math.ceil(count / columns);
    // 札の幅と高さのうち小さいほう(写真の大きさを決める)。札は縦長(幅:高さ = 3:4)を目安にする。
    const size = Math.min(W / columns, (H / rows) * 0.75);
    if (size > best.size) best = { columns, rows, size };
  }
  return { columns: best.columns, rows: best.rows };
}

export type ExpiryState = "none" | "ok" | "soon" | "expired";

/** 在留期限の状態: 未入力 / まだ先 / 期限まで EXPIRY_WARN_DAYS 日以内 / 過ぎている。 */
export function expiryState(expiresOn: string | null, today: string): { state: ExpiryState; daysLeft: number | null } {
  if (!expiresOn) return { state: "none", daysLeft: null };
  const daysLeft = diffDays(today, expiresOn);
  if (daysLeft < 0) return { state: "expired", daysLeft };
  if (daysLeft <= EXPIRY_WARN_DAYS) return { state: "soon", daysLeft };
  return { state: "ok", daysLeft };
}

/** `YYYY-MM-DD` を「2026年10月23日」に。 */
export function formatJapaneseDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}
