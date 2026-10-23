// 送り先の部屋(LINE WORKS のトークルーム)を画面から作るときの純粋関数(docs/DESIGN.md 40 章)。

export type RoomCandidate = {
  id: string;
  employeeNumber: string;
  name: string;
  kana: string;
  department: string;
};

export const ROOM_TITLE_MAX = 50;
export const ROOM_MEMBERS_MAX = 200;

/** 在籍中か(入社日・退職日・状態。組織図の名簿と同じ判定)。 */
export function isOnRoster(e: { hiredOn: string; leftOn: string | null; status: string }, today: string): boolean {
  if (e.status !== "active" && e.status !== "leave") return false;
  if (e.hiredOn > today) return false;
  return e.leftOn === null || e.leftOn >= today;
}

/**
 * 選んだ社員を LINE WORKS の利用者の ID に置き換える。match は社員 1 人に当たる ID(見つからなければ null)。
 * 見つからない人は missing に名前で返す(1 人でもいれば部屋は作らない)。同じ ID は 1 回だけ入れる。
 */
export function pickLineWorksMembers<E extends { name: string }>(
  employees: readonly E[],
  match: (e: E) => string | null,
): { memberIds: string[]; missing: string[] } {
  const memberIds = new Set<string>();
  const missing: string[] = [];
  for (const e of employees) {
    const id = match(e);
    if (id) memberIds.add(id);
    else missing.push(e.name);
  }
  return { memberIds: [...memberIds], missing };
}
