// お知らせの見え方の判定(純粋関数。DB に依存しない)。docs/DESIGN.md 23 章。
import {
  NOTICE_ATTACHMENT_EXTENSIONS,
  NOTICE_INLINE_IMAGE_TYPES,
  type NoticePriority,
  type NoticeStatus,
  type NoticeTarget,
} from "./constants";

export type NoticeFacts = {
  status: NoticeStatus;
  target: NoticeTarget;
  priority: NoticePriority;
  audienceId: string | null;
  publishedOn: string;
  expiresOn: string | null;
  bannerUntil: string | null;
};

/** 掲載中か(公開済みで、掲載期間内)。日付は JST の `YYYY-MM-DD`。 */
export function isNoticeLive(n: Pick<NoticeFacts, "status" | "publishedOn" | "expiresOn">, today: string): boolean {
  return n.status === "published" && n.publishedOn <= today && (n.expiresOn === null || n.expiresOn >= today);
}

/** 見る人の情報。社員でないアカウント(管理者用など)は employeeId が null。 */
export type NoticeViewer = {
  employeeId: string | null;
  /** その人が当てはまる、有効な Audience の ID。 */
  matchedAudienceIds: ReadonlySet<string>;
};

/**
 * 宛先に当てはまるか(deny by default)。
 * - company: ログインできる全員。
 * - audience: その Audience(有効なもの)に当てはまる社員。
 * - individual: 宛先に入っている社員。
 */
export function isNoticeAddressedTo(
  n: Pick<NoticeFacts, "target" | "audienceId">,
  viewer: NoticeViewer,
  recipientIds: ReadonlySet<string>,
): boolean {
  switch (n.target) {
    case "company":
      return true;
    case "audience":
      return n.audienceId !== null && viewer.matchedAudienceIds.has(n.audienceId);
    case "individual":
      return viewer.employeeId !== null && recipientIds.has(viewer.employeeId);
    default:
      return false;
  }
}

/** ホーム上部のバナーに出すか。全社宛の緊急で、バナーの最終日まで。 */
export function isNoticeBanner(n: NoticeFacts, today: string): boolean {
  return (
    isNoticeLive(n, today) &&
    n.target === "company" &&
    n.priority === "urgent" &&
    n.bannerUntil !== null &&
    n.bannerUntil >= today
  );
}

/** 本文の先頭(一覧の 1 行の要約用)。改行は空白にする。 */
export function summarize(body: string, max = 80): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export type BodyPart = { type: "text"; text: string } | { type: "link"; url: string };

/**
 * 本文を、文字と URL(https:// / http:// で始まるもの)に分ける。URL は画面でリンクにする。
 * 文末の句読点・閉じかっこは URL に含めない(「…を見てください。https://example.com)。」など)。
 */
export function splitBodyLinks(body: string): BodyPart[] {
  const parts: BodyPart[] = [];
  const pattern = /https?:\/\/[^\s<>"'「」『』()（）、。]+/g;
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    let url = match[0];
    const trailing = /[.,;:!?)\]]+$/.exec(url)?.[0] ?? "";
    url = url.slice(0, url.length - trailing.length);
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: "text", text: body.slice(last, start) });
    parts.push({ type: "link", url });
    last = start + url.length;
  }
  if (last < body.length) parts.push({ type: "text", text: body.slice(last) });
  return parts;
}

// ---- 添付ファイル ----------------------------------------------------------------

/** 付けてよいファイルか(拡張子で判断する。ブラウザが種類を空で送ることがあるため)。 */
export function isAllowedNoticeAttachment(fileName: string): boolean {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return (NOTICE_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext);
}

/** お知らせの中に画像として表示するか。 */
export function isInlineNoticeImage(contentType: string): boolean {
  return (NOTICE_INLINE_IMAGE_TYPES as readonly string[]).includes(contentType);
}

/** ファイルの大きさの表示(1.2MB、350KB など)。 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
