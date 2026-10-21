// 全社の予定・参加の呼びかけの判定(純粋関数。DB に依存しない)。docs/DESIGN.md 38 章。
import type { CompanyYear } from "./company-calendar";
import {
  OFF_EVENT_KINDS,
  type CompanyEventKind,
  type EventResponse,
  type EventVisibility,
  type OffEventKind,
} from "./constants";

export function isOffKind(kind: CompanyEventKind): kind is OffEventKind {
  return (OFF_EVENT_KINDS as readonly string[]).includes(kind);
}

/**
 * 紙の会社カレンダーに、DB に登録された全社の休み(一斉有給取得日・臨時休業)を重ねる。元のカレンダーは変えない。
 * 会社カレンダーが未登録の年の日は無視する(その年はまだ休み・出勤日が分からないため)。
 */
export function withCompanyOffDays(
  base: Record<number, CompanyYear>,
  offDays: readonly { date: string; kind: CompanyEventKind; title: string }[],
): Record<number, CompanyYear> {
  const result: Record<number, CompanyYear> = { ...base };
  for (const d of offDays) {
    if (!isOffKind(d.kind)) continue;
    const y = Number(d.date.slice(0, 4));
    const year = result[y];
    if (!year) continue;
    const extra = { ...(year.extraOffDays ?? {}) };
    const md = d.date.slice(5);
    // 同じ日に 2 件あれば、先に登録されたもの(並び順の先)を使う
    if (!extra[md]) extra[md] = { kind: d.kind, title: d.title };
    result[y] = { ...year, extraOffDays: extra };
  }
  return result;
}

/** 判定に使う予定の項目 */
export type EventFacts = {
  kind: CompanyEventKind;
  date: string;
  visibility: EventVisibility;
  audienceId: string | null;
  createdBy: string | null;
};

/** 見る人。社員でないアカウントは employeeId が null。 */
export type EventViewer = {
  userId: string;
  employeeId: string | null;
  /** その人が当てはまる、有効な Audience の ID */
  matchedAudienceIds: ReadonlySet<string>;
};

/**
 * 呼びかけの相手か。名指し(invitedEmployeeIds)か Audience に当てはまる社員。登録した本人は含めない。
 * 行事・予定(event)だけが呼びかけを持つ。
 */
export function isInvited(event: EventFacts, viewer: EventViewer, invitedEmployeeIds: ReadonlySet<string>): boolean {
  if (event.kind !== "event") return false;
  if (event.createdBy !== null && event.createdBy === viewer.userId) return false;
  if (viewer.employeeId === null) return false;
  if (invitedEmployeeIds.has(viewer.employeeId)) return true;
  return event.audienceId !== null && viewer.matchedAudienceIds.has(event.audienceId);
}

/** 見えるか(deny by default)。company は全員、invitees は登録した本人と相手だけ。 */
export function canSeeEvent(event: EventFacts, viewer: EventViewer, invited: boolean): boolean {
  if (event.visibility === "company") return true;
  if (event.createdBy !== null && event.createdBy === viewer.userId) return true;
  return invited;
}

/** 返事ができるか(相手で、予定の日がまだ過ぎていない)。 */
export function canRespond(event: Pick<EventFacts, "date">, invited: boolean, today: string): boolean {
  return invited && event.date >= today;
}

/** 返事のお願いを出すか(返事ができて、まだ返事をしていない)。 */
export function needsResponse(
  event: Pick<EventFacts, "date">,
  invited: boolean,
  response: EventResponse | null,
  today: string,
): boolean {
  return canRespond(event, invited, today) && response === null;
}

/**
 * 編集・削除と、返事の一覧を見られるか。
 * company は calendar.events.manage を持つ人、invitees は登録した本人だけ(他人の私的な呼びかけは管理者も見ない)。
 */
export function canEditEvent(
  event: Pick<EventFacts, "visibility" | "createdBy">,
  actor: { userId: string; canManage: boolean },
): boolean {
  if (event.visibility === "company") return actor.canManage;
  return event.createdBy !== null && event.createdBy === actor.userId;
}

/** calendar.events.manage が必要な登録か(休みの 2 種類・全社に表示・Audience への呼びかけ)。 */
export function requiresManage(input: { kind: CompanyEventKind; visibility: EventVisibility; audienceId: string | null }): boolean {
  return isOffKind(input.kind) || input.visibility === "company" || input.audienceId !== null;
}

/** 返事の集計 */
export function countResponses(responses: readonly (EventResponse | null)[]): { yes: number; no: number; none: number } {
  let yes = 0;
  let no = 0;
  let none = 0;
  for (const r of responses) {
    if (r === "yes") yes++;
    else if (r === "no") no++;
    else none++;
  }
  return { yes, no, none };
}
