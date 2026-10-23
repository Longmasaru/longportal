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

/** 1 件のお知らせに付けられる添付ファイルの数と、1 ファイルの大きさの上限(docs/DESIGN.md 23.1)。 */
export const MAX_NOTICE_ATTACHMENTS = 10;
export const MAX_NOTICE_ATTACHMENT_MB = 25;

/** 実行できる形式のファイルは添付させない(社員が開いてしまう事故を防ぐ)。 */
const BLOCKED_EXTENSIONS = new Set([
  "exe", "msi", "bat", "cmd", "com", "scr", "pif", "vbs", "vbe", "js", "jse", "wsf", "wsh", "ps1", "hta", "lnk", "reg", "jar", "dll",
]);

/** 添付できないファイルなら、その理由。添付できるなら null。 */
export function attachmentProblem(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  if (BLOCKED_EXTENSIONS.has(ext)) return `${file.name} は、実行できる形式のため添付できません。`;
  if (file.size <= 0) return `${file.name} は空のファイルです。`;
  if (file.size > MAX_NOTICE_ATTACHMENT_MB * 1024 * 1024) return `${file.name} は ${MAX_NOTICE_ATTACHMENT_MB}MB を超えています。`;
  return null;
}

/** 文の長さが、AI で整えられるだけあるか。 */
export const NOTICE_POLISH_MIN = 10;
