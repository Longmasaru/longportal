import type { NoticeKind, NoticePriority, NoticeTarget } from "./constants";

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

export const NOTICE_PRIORITY_LABEL: Record<NoticePriority, string> = {
  normal: "通常",
  important: "重要",
  urgent: "緊急",
};

export const NOTICE_TARGET_LABEL: Record<NoticeTarget, string> = {
  company: "全社",
  audience: "Audience(条件で指定)",
  individual: "個人指定",
};
