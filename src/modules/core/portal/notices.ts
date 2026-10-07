import type { Notice, NoticeKind } from "./types";

export const NOTICE_KIND_LABEL: Record<NoticeKind, string> = {
  general: "連絡",
  request: "確認依頼",
  approval: "承認依頼",
  education: "教育",
  case: "担当案件",
  safety: "安全",
  health: "健康",
  event: "行事",
  rule: "ルール",
  system: "システム",
};

export type NoticeChannel = "personal" | "company";

/**
 * サイドバーの「個人」「重要・全社」への振り分け。
 * 全社員宛(target = company)は「重要・全社」、それ以外(特定 Audience 宛・個人指定)は「個人」。
 */
export function noticeChannel(notice: Notice): NoticeChannel {
  return notice.target === "company" ? "company" : "personal";
}

/** ホーム上部にバナー表示するか。全社宛の urgent で、表示期限内のものだけ。 */
export function isBannerActive(notice: Notice, today: string): boolean {
  return (
    notice.target === "company" &&
    notice.priority === "urgent" &&
    notice.bannerUntil !== undefined &&
    notice.bannerUntil >= today
  );
}

/** 要対応 → 未読 → 新しい順。 */
export function comparePersonalNotices(a: Notice, b: Notice): number {
  if (a.requiresAction !== b.requiresAction) return a.requiresAction ? -1 : 1;
  if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
  return b.publishedOn.localeCompare(a.publishedOn);
}
