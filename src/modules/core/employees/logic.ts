// 社員管理の純粋なロジック(DB・セッションに依存しない)。日付は `YYYY-MM-DD`(JST の暦日)の文字列。
import { addDays, diffDays } from "../shared/date";

// ---- 主所属の異動 ------------------------------------------------------------

export type PrimaryAssignmentFacts = {
  id: string;
  startDate: string;
  endDate: string | null;
};

export type TransferPlan =
  | { ok: true; endCurrent: { id: string; endDate: string } | null }
  | { ok: false; error: string };

/**
 * 異動日(effectiveDate)に新しい主所属を始めるための計画。
 * - 異動日にその時点で有効な主所属があれば、前日(異動日 - 1)で終了させる。
 * - 異動日以降に開始する主所属が既にある場合は、順序が崩れるため登録できない。
 * 主所属の期間重複は DB の排他制約でも防ぐ(これは画面に分かりやすい理由を返すための事前判定)。
 */
export function planTransfer(
  primaries: PrimaryAssignmentFacts[],
  effectiveDate: string,
): TransferPlan {
  if (primaries.some((p) => p.startDate >= effectiveDate)) {
    return { ok: false, error: "異動日以降に開始する主所属が既にあります。異動日を確認してください。" };
  }
  const covering = primaries.find(
    (p) => p.startDate < effectiveDate && (p.endDate === null || p.endDate >= effectiveDate),
  );
  return {
    ok: true,
    endCurrent: covering ? { id: covering.id, endDate: addDays(effectiveDate, -1) } : null,
  };
}

export type AssignmentChangePlan =
  | { ok: true; kind: "correct"; assignmentId: string }
  | { ok: true; kind: "transfer"; endCurrent: { id: string; endDate: string } }
  | { ok: false; error: string };

/**
 * 今の主所属の部署・拠点を変える計画(所属の割り当て画面用)。
 * - 変更日に有効な主所属が、変更日に始まったものなら、その所属の部署・拠点を付け直す(同じ日の訂正)。
 * - それより前に始まったものなら、前日で終了させ、新しい部署・拠点の主所属を変更日から始める(異動)。
 */
export function planAssignmentChange(
  primaries: PrimaryAssignmentFacts[],
  effectiveDate: string,
): AssignmentChangePlan {
  if (primaries.some((p) => p.startDate > effectiveDate)) {
    return { ok: false, error: "変更日より後に始まる主所属があります。社員の詳細画面で確認してください。" };
  }
  const covering = primaries.find(
    (p) => p.startDate <= effectiveDate && (p.endDate === null || p.endDate >= effectiveDate),
  );
  if (!covering) return { ok: false, error: "変更日に有効な主所属がありません。" };
  if (covering.startDate === effectiveDate) {
    return { ok: true, kind: "correct", assignmentId: covering.id };
  }
  return { ok: true, kind: "transfer", endCurrent: { id: covering.id, endDate: addDays(effectiveDate, -1) } };
}

/** 終了していない主所属(end_date が NULL か今日以降)があるか。アカウント有効化の条件。 */
export function hasOpenPrimaryAssignment(
  assignments: { isPrimary: boolean; endDate: string | null }[],
  today: string,
): boolean {
  return assignments.some((a) => a.isPrimary && (a.endDate === null || a.endDate >= today));
}

// ---- 警告 ----------------------------------------------------------------------

export type EmployeeWarningCode =
  | "unassigned"
  | "unassigned_soon"
  | "no_current_assignment"
  | "planned_overdue"
  | "role_scope_mismatch"
  | "account_active_but_gone";

export type EmployeeWarning = { code: EmployeeWarningCode; message: string };

export type WarningInput = {
  status: string;
  hiredOn: string;
  leftOn: string | null;
  /** 終了していない主所属があるか(開始日が未来でもよい)。 */
  hasOpenPrimaryAssignment: boolean;
  /** 今日時点で有効な主所属があるか。 */
  hasCurrentPrimaryAssignment: boolean;
  /** スコープ付きのロールに、現在の所属と合わないものがあるか(異動後の見直し用)。 */
  hasRoleScopeMismatch: boolean;
  userStatus: string | null;
};

/** 入社日までの日数がこの値以下で主所属が未設定なら、より強い警告にする。 */
export const UNASSIGNED_SOON_DAYS = 14;

export function employeeWarnings(input: WarningInput, today: string): EmployeeWarning[] {
  const warnings: EmployeeWarning[] = [];
  const gone = input.status === "retired" || (input.leftOn !== null && input.leftOn < today);

  if (!gone && !input.hasOpenPrimaryAssignment) {
    if (diffDays(today, input.hiredOn) <= UNASSIGNED_SOON_DAYS) {
      warnings.push({
        code: "unassigned_soon",
        message: "入社日が近い(または過ぎている)のに、主所属が未設定です。所属を設定してください。",
      });
    } else {
      warnings.push({
        code: "unassigned",
        message: "主所属が未設定です。入社日までに設定してください。",
      });
    }
  }
  // 利用中(在籍・休職、入社日以降)なのに、今日時点の主所属がない(開始前、または終了済み)。
  const inService = (input.status === "active" || input.status === "leave") && input.hiredOn <= today;
  if (!gone && inService && input.hasOpenPrimaryAssignment && !input.hasCurrentPrimaryAssignment) {
    warnings.push({
      code: "no_current_assignment",
      message: "今日時点で有効な主所属がありません(所属の開始前です)。開始日を確認してください。",
    });
  }
  if (input.status === "planned" && input.hiredOn <= today) {
    warnings.push({
      code: "planned_overdue",
      message:
        "入社日を過ぎていますが、状態が「入社予定」のままです。利用を開始するには「在籍」に変更してください。",
    });
  }
  if (!gone && input.hasRoleScopeMismatch) {
    warnings.push({
      code: "role_scope_mismatch",
      message:
        "この社員には現在の所属と異なる Scope の Role があります。見直してください。(ロールは異動しても自動では変わりません)",
    });
  }
  if (gone && input.userStatus === "active") {
    warnings.push({
      code: "account_active_but_gone",
      message:
        "退職済みですが、ログインアカウントが有効のままです。アクセスは拒否されていますが、無効化してください。",
    });
  }
  return warnings;
}
