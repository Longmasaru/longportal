// お知らせの見え方の判定(純粋関数。DB に依存しない)。docs/DESIGN.md 23 章。
import type { NoticePriority, NoticeStatus, NoticeTarget } from "./constants";

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
