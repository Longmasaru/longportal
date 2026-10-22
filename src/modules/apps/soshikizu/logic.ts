import type { OrgBox, OrgMember, OrgUnit } from "./types";

/**
 * 箱の中の並び順: 役職の序列が高い順 → 役職の表示順 → 役職なしは最後 → 入社が早い順 → 社員番号。
 * 序列は「大きいほど上位」(マスタ管理の序列と同じ)。
 */
export function compareMembers(a: OrgMember, b: OrgMember): number {
  const aHas = a.positionRank !== null;
  const bHas = b.positionRank !== null;
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (aHas && bHas) {
    if (a.positionRank !== b.positionRank) return (b.positionRank ?? 0) - (a.positionRank ?? 0);
    if (a.positionSortOrder !== b.positionSortOrder) return (a.positionSortOrder ?? 0) - (b.positionSortOrder ?? 0);
  }
  if (a.hiredOn !== b.hiredOn) return a.hiredOn < b.hiredOn ? -1 : 1;
  return a.employeeNumber < b.employeeNumber ? -1 : a.employeeNumber > b.employeeNumber ? 1 : 0;
}

/**
 * 経営の役職(部署の箱には入れず、組織図の一番上に別に並べる)。役職名にこの言葉を含めば経営とみなす(「代表取締役社長」「副社長」も含む)。
 * 2026-10-21 のユーザーの判断: 社長・専務・常務・工場長。
 */
export const EXECUTIVE_TITLE_WORDS = ["社長", "専務", "常務", "工場長"] as const;

/**
 * 役職名では決まらないが、経営に並べる人(氏名。空白は無視して比べる)。
 * 2026-10-21 のユーザーの判断: 長井 将さん。
 */
export const EXECUTIVE_NAMES = ["長井将"] as const;

const squash = (s: string) => s.replace(/\s/g, "");

export function isExecutive(m: Pick<OrgMember, "positionName" | "name">): boolean {
  const title = m.positionName ?? "";
  if (EXECUTIVE_TITLE_WORDS.some((w) => title.includes(w))) return true;
  const name = squash(m.name);
  return EXECUTIVE_NAMES.some((n) => n === name);
}

/** 組織図: 一番上の経営の人と、部署ごとの箱(経営の人は箱に入れない)。 */
export function buildOrgChart(
  members: readonly OrgMember[],
  departments: readonly OrgUnit[],
  locationId: string | null,
): { executives: OrgMember[]; boxes: OrgBox[] } {
  const shown = locationId ? members.filter((m) => m.locationId === locationId) : members;
  return {
    executives: shown.filter(isExecutive).sort(compareMembers),
    boxes: buildOrgBoxes(
      members.filter((m) => !isExecutive(m)),
      departments,
      locationId,
    ),
  };
}

/**
 * 部署ごとの箱を作る。部署は表示順(sort_order → code)、人のいない部署は出さない。
 * locationId を指定すると、その拠点の主所属の人だけを載せる(所属のない人の箱も出さない)。
 * 所属のない人(拠点で絞っていないとき)は、最後に department = null の箱にまとめる。
 */
export function buildOrgBoxes(
  members: readonly OrgMember[],
  departments: readonly OrgUnit[],
  locationId: string | null,
): OrgBox[] {
  const shown = locationId ? members.filter((m) => m.locationId === locationId) : members;
  const byDept = new Map<string | null, OrgMember[]>();
  for (const m of shown) {
    const list = byDept.get(m.departmentId) ?? [];
    list.push(m);
    byDept.set(m.departmentId, list);
  }

  const toBox = (department: OrgUnit | null, list: OrgMember[]): OrgBox => {
    const sorted = [...list].sort(compareMembers);
    return {
      department,
      leaders: sorted.filter((m) => m.isManagement),
      members: sorted.filter((m) => !m.isManagement),
      count: sorted.length,
    };
  };

  const ordered = [...departments].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  const boxes = ordered.flatMap((d) => {
    const list = byDept.get(d.id);
    return list && list.length > 0 ? [toBox(d, list)] : [];
  });
  // 主所属のない人と、一覧にない(無効になった)部署の人は「所属なし」にまとめる。
  const known = new Set(ordered.map((d) => d.id));
  const unassigned = shown.filter((m) => m.departmentId === null || !known.has(m.departmentId));
  if (unassigned.length > 0) boxes.push(toBox(null, unassigned));
  return boxes;
}

/**
 * 組織図に載せる在籍者か。ログインの在籍判定(core/access の evaluate)と同じ考え方:
 * 人事上の状態が active / leave で、基準日に入社済み、最終在籍日を過ぎていない。
 */
export function isOnRoster(
  e: { hiredOn: string; leftOn: string | null; status: string },
  today: string,
): boolean {
  if (e.status !== "active" && e.status !== "leave") return false;
  if (e.hiredOn > today) return false;
  return e.leftOn === null || e.leftOn >= today;
}

/**
 * LINE WORKS で、その人との 1 対 1 のトークを開く URL(App Link。スマホはアプリ、PC はアプリかブラウザで開く)。
 * 宛先は LINE WORKS のアカウント(メールの形)。
 */
export function lineWorksTalkUrl(account: string): string {
  const url = new URL("https://line.worksmobile.com/message/send");
  url.searchParams.set("version", "26");
  url.searchParams.set("emailList", account);
  return url.toString();
}
