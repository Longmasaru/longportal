import { grantAllows, hasGlobalGrant, type Grant } from "@/modules/core/access/grants";
import { FIELD_MAX, SCORE_MAX, SCORE_MIN, SCORE_NOTE_MAX, TEXT_FIELDS, type ReportStatus, type TextField } from "./labels";

// 日報アプリの見え方の判定(DB・セッションに依存しない純粋関数)。docs/DESIGN.md 38 章。

/** 日報を書いた社員の、今日有効な所属(拠点・部署)。 */
export type TargetAssignment = { locationId: string; departmentId: string };

/**
 * 他の人の日報を読んでコメントできるか。
 * 全社の割当なら全員。拠点・部署つきの割当なら、書いた社員の今日の所属のどれかがスコープに当てはまるとき。
 */
export function canReviewEmployee(grants: Grant[], code: string, assignments: TargetAssignment[]): boolean {
  if (hasGlobalGrant(grants, code)) return true;
  return assignments.some((a) => grantAllows(grants, code, a));
}

/** 日報の見え方。owner = 書いた本人(編集・返信できる)、reviewer = 指導者(読む・コメント)、none = 見られない。 */
export type ReportMode = "owner" | "reviewer" | "none";

export function reportMode(
  viewerEmployeeId: string | null,
  ownerEmployeeId: string,
  status: ReportStatus,
  canReview: boolean,
): ReportMode {
  // 自分の日報は、権限があっても本人の見え方にする。
  if (viewerEmployeeId === ownerEmployeeId) return "owner";
  // 下書きは本人だけ。
  return canReview && status === "submitted" ? "reviewer" : "none";
}

/** 提出済みで、本人以外のコメントがまだない日報(指導者の「コメント待ち」)。 */
export function awaitsComment(status: ReportStatus, reviewerCommentCount: number): boolean {
  return status === "submitted" && reviewerCommentCount === 0;
}

/**
 * ホームに「今日の日報を書きましょう」を出すか。
 * 一度でも日報を書いた人(= 日報を書く人)で、今日の日報をまだ提出していないとき。日曜は出さない。
 */
export function shouldRemindToday(weekday: string, hasAnyReport: boolean, todayStatus: ReportStatus | null): boolean {
  if (weekday === "日") return false;
  return hasAnyReport && todayStatus !== "submitted";
}

export type ReportFields = Record<TextField, string> & { score: number | null; scoreNote: string };

export function emptyFields(): ReportFields {
  const fields = Object.fromEntries(TEXT_FIELDS.map((f) => [f, ""])) as Record<TextField, string>;
  return { ...fields, score: null, scoreNote: "" };
}

/** 提出の前の確認。足りないものがあれば、その説明を返す。 */
export function submitProblem(fields: ReportFields): string | null {
  if (!fields.training.trim()) return "「今日の研修内容」を書いてから提出してください。";
  return null;
}

/**
 * AI が返した振り分けの結果を、日報の項目に当てはまる形だけに整える(知らない項目・型の違うものは捨てる)。
 * 点数は 1〜10 の整数だけ。文章は前後の空白を除き、上限で切る。
 */
export function sanitizeSorted(raw: unknown): Partial<ReportFields> {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const out: Partial<ReportFields> = {};
  for (const f of TEXT_FIELDS) {
    const v = input[f];
    if (typeof v === "string" && v.trim()) out[f] = v.trim().slice(0, FIELD_MAX);
  }
  const score = input.score;
  if (typeof score === "number" && Number.isInteger(score) && score >= SCORE_MIN && score <= SCORE_MAX) out.score = score;
  const note = input.scoreNote;
  if (typeof note === "string" && note.trim()) out.scoreNote = note.trim().slice(0, SCORE_NOTE_MAX);
  return out;
}

/**
 * 振り分けの結果を、今の入力に足す。空の項目はそのまま入れ、書いてある項目は改行して後ろに足す(消さない)。
 * 点数は、まだ付いていないときだけ入れる。
 */
export function mergeSorted(current: ReportFields, sorted: Partial<ReportFields>): ReportFields {
  const next = { ...current };
  for (const f of TEXT_FIELDS) {
    const add = sorted[f];
    if (!add) continue;
    next[f] = current[f].trim() ? `${current[f].trimEnd()}\n${add}` : add;
  }
  if (sorted.score != null && current.score == null) next.score = sorted.score;
  if (sorted.scoreNote) next.scoreNote = current.scoreNote.trim() ? `${current.scoreNote.trimEnd()} ${sorted.scoreNote}` : sorted.scoreNote;
  return next;
}
