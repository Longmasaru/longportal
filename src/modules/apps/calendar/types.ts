import type { CompanyEventKind, EventResponse, EventVisibility } from "./constants";

/** 画面に渡すメモ・予定 */
export type CalendarEntry = {
  id: string;
  date: string;
  time: string | null;
  title: string;
  note: string;
};

export type EntryFormState = { error?: string; ok?: number } | undefined;

/** 見る人から見た全社の予定・呼びかけ(見える条件を通ったものだけ)。docs/DESIGN.md 38 章。 */
export type ViewerEvent = {
  id: string;
  kind: CompanyEventKind;
  date: string;
  time: string | null;
  title: string;
  note: string;
  visibility: EventVisibility;
  /** 呼びかけの相手か */
  invited: boolean;
  myResponse: EventResponse | null;
  canRespond: boolean;
  /** 編集・返事の一覧を見られるか */
  canEdit: boolean;
  /** 呼びかけ(名指し・Audience)が付いているか(編集できる人にだけ意味がある) */
  hasInvitees: boolean;
};

/** 返事のお願い */
export type PendingInvitation = { id: string; date: string; time: string | null; title: string };

export type EventFormState = { error?: string } | undefined;
export type RespondState = { error?: string; ok?: number } | undefined;

/** 返事の一覧の 1 行 */
export type InviteeStatus = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  affiliation: string;
  hasAccount: boolean;
  response: EventResponse | null;
};

/** 呼びかけの相手の候補(在籍中でアカウントのある社員) */
export type InviteeOption = { id: string; employeeNumber: string; name: string; nameKana: string; affiliation: string };

/**
 * ほかのアプリの、日付つきの項目(例: TODO の期限)。カレンダーはほかのアプリを参照しないので、
 * src/app のルートが読んで、ただのデータとして渡す(docs/DESIGN.md 41.4)。本人に見せてよいものだけを渡すこと。
 */
export type ExtraDayItem = {
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
  title: string;
  /** 小さな印(例: 「TODO」「○○さんから」) */
  tag: string;
  /** 押したときに開くページ(任意) */
  href?: string;
};
