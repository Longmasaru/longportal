// アクセス可否の純粋な判定(DB・セッションに依存しない)。docs/DESIGN.md 5.2 の評価順のうち、
// ユーザー・社員の状態に関する部分。テストしやすいよう resolveActor から分離している。

/** アクセスを拒否する理由。 */
export type AccessDenyReason =
  | "user_disabled" // users.status が active でない
  | "employee_not_active" // employees.status が active / leave 以外(planned・retired・未知の値)
  | "not_yet_hired" // hired_on が今日より後
  | "left_company"; // left_on が今日より前(退職日当日は利用可、翌日から deny)

export type UserAccessFacts = { status: string };

export type EmployeeAccessFacts = {
  status: string;
  /** `YYYY-MM-DD` */
  hiredOn: string;
  /** `YYYY-MM-DD`(最終在籍日) */
  leftOn: string | null;
};

/**
 * 社員に関する判定(docs/DESIGN.md 5.2 の 4〜6)。
 * - 休職(leave)は利用可。利用を止める場合は users.status = disabled で制御する。
 * - hired_on が未来、または left_on が過去なら、status に関係なく deny(誤操作・バッチ失敗に備えた安全側の判定)。
 * - 日付は `YYYY-MM-DD` の文字列なので、辞書順の比較がそのまま日付の比較になる。
 */
export function evaluateEmployeeAccess(
  employee: EmployeeAccessFacts,
  today: string,
): AccessDenyReason | null {
  if (employee.status !== "active" && employee.status !== "leave") return "employee_not_active";
  if (employee.hiredOn > today) return "not_yet_hired";
  if (employee.leftOn !== null && employee.leftOn < today) return "left_company";
  return null;
}

/** ユーザーと(いれば)紐づく社員をまとめた判定(docs/DESIGN.md 5.2 の 2〜6)。 */
export function evaluateUserAccess(
  user: UserAccessFacts,
  employee: EmployeeAccessFacts | null,
  today: string,
): AccessDenyReason | null {
  if (user.status !== "active") return "user_disabled";
  // 社員以外のユーザー(employee_id が NULL)は、社員の判定を飛ばす。
  if (employee === null) return null;
  return evaluateEmployeeAccess(employee, today);
}
