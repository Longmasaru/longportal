// 会社カレンダーの全社の予定・呼びかけの定数(docs/DESIGN.md 38 章)。クライアントからも使える。

export const COMPANY_EVENT_KINDS = ["paid_leave_day", "temporary_closure", "event"] as const;
export type CompanyEventKind = (typeof COMPANY_EVENT_KINDS)[number];

/** 休みとして数える種類 */
export const OFF_EVENT_KINDS = ["paid_leave_day", "temporary_closure"] as const;
export type OffEventKind = (typeof OFF_EVENT_KINDS)[number];

export const EVENT_VISIBILITIES = ["company", "invitees"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export const EVENT_RESPONSES = ["yes", "no"] as const;
export type EventResponse = (typeof EVENT_RESPONSES)[number];

export const EVENT_KIND_LABEL: Record<CompanyEventKind, string> = {
  paid_leave_day: "一斉有給取得日",
  temporary_closure: "臨時休業",
  event: "行事・予定",
};

/** 月の表に付ける短い印 */
export const OFF_EVENT_MARK: Record<OffEventKind, string> = {
  paid_leave_day: "有給",
  temporary_closure: "臨時休業",
};

export const EVENT_RESPONSE_LABEL: Record<EventResponse, string> = { yes: "参加", no: "不参加" };

/** 権限(manifest と同じ code) */
export const EVENTS_MANAGE = "calendar.events.manage";

export const EVENT_TITLE_MAX = 100;
export const EVENT_NOTE_MAX = 1000;
/** 名指しできる相手の上限 */
export const MAX_INVITEES = 300;
