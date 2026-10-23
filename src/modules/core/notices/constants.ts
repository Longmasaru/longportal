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

// ---- 添付ファイル(docs/DESIGN.md 43 章)----------------------------------------

/** 1 件のお知らせに付けられる数。 */
export const NOTICE_ATTACHMENT_MAX_COUNT = 10;
/** 1 つの上限(バイト)。core/storage の上限と同じ。 */
export const NOTICE_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
/** 付けられるファイルの拡張子(小文字)。 */
export const NOTICE_ATTACHMENT_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "txt",
  "zip",
  "mp4",
  "mov",
] as const;
/** お知らせの中にそのまま表示する画像の種類(それ以外は、名前を押して開く)。 */
export const NOTICE_INLINE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
