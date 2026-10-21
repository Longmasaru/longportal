import type { ReportFields } from "./logic";
import type { ReportStatus } from "./labels";

/** 一覧に出す日報。 */
export type ReportSummary = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  reportDate: string;
  status: ReportStatus;
  training: string;
  score: number | null;
  submittedAt: Date | null;
  /** 本人以外(指導者)のコメントの数 */
  reviewerComments: number;
  /** 本人の返信の数 */
  ownerComments: number;
  lastCommentAt: Date | null;
};

export type ReportComment = {
  id: string;
  body: string;
  byOwner: boolean;
  authorUserId: string | null;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 日報 1 件の画面。 */
export type ReportDetail = ReportFields & {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  reportDate: string;
  status: ReportStatus;
  submittedAt: Date | null;
  updatedAt: Date;
  comments: ReportComment[];
};

/** 指導者の一覧の絞り込みに出す、日報を書いている社員。 */
export type Writer = { id: string; name: string; employeeNumber: string };

export type FormState = { error?: string; ok?: number; savedAs?: ReportStatus; reportId?: string } | undefined;
