// お知らせの選択肢(画面・サーバー・スキーマで共通。DB に依存しないので、クライアントからも読める)。

export const NOTICE_KINDS = [
  "general",
  "request",
  "approval",
  "education",
  "case",
  "safety",
  "health",
  "event",
  "rule",
  "system",
] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

export const NOTICE_PRIORITIES = ["normal", "important", "urgent"] as const;
export type NoticePriority = (typeof NOTICE_PRIORITIES)[number];

export const NOTICE_TARGETS = ["company", "audience", "individual"] as const;
export type NoticeTarget = (typeof NOTICE_TARGETS)[number];

export const NOTICE_STATUSES = ["draft", "published"] as const;
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];
