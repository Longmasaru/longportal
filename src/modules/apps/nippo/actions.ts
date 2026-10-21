"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAppAccess } from "@/modules/core/apps";
import { writeAuditLog } from "@/modules/core/audit";
import { isIsoDate } from "@/modules/core/shared/date";
import { COMMENT_MAX, FIELD_MAX, MEMO_MAX, MEMO_MIN, SCORE_MAX, SCORE_MIN, SCORE_NOTE_MAX, TEXT_FIELDS } from "./labels";
import { submitProblem, type ReportFields } from "./logic";
import { manifest } from "./manifest";
import { getComment, getOwnReportByDate, getReportRow, modeForReport } from "./queries";
import { nippoComments, nippoReports } from "./schema";
import { sortMemo, type SortResult } from "./sort";
import type { FormState } from "./types";

// 日報の Server Action(docs/DESIGN.md 39 章)。画面以外からも呼べるため、毎回
// requireAppAccess(アプリを使えるか)と、日報の見え方(本人 / スコープ内の指導者)を判定する。
// 日報を書けるのは本人だけ(自分の社員に紐づく日報)。コメントは本人と指導者。

const NO_EMPLOYEE = "このアカウントには社員の情報が紐づいていないため、日報を書けません。";
const NOT_FOUND = "見つかりませんでした。画面を再読み込みしてください。";

const textSchema = z.string().max(FIELD_MAX, `各項目は${FIELD_MAX}文字以内で入力してください。`);

const reportSchema = z.object({
  reportDate: z.string().refine(isIsoDate, "日付が正しくありません。"),
  intent: z.enum(["draft", "submit"]),
  ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, textSchema])),
  score: z.union([
    z.literal("").transform(() => null),
    z.coerce.number().int().min(SCORE_MIN, "点数を選んでください。").max(SCORE_MAX, "点数を選んでください。"),
  ]),
  scoreNote: z.string().max(SCORE_NOTE_MAX, `一言は${SCORE_NOTE_MAX}文字以内で入力してください。`),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力内容を確認してください。";
}

function revalidate() {
  revalidatePath(manifest.route, "layout");
  revalidatePath("/");
}

/** 日報の保存(下書き / 提出)。同じ日の日報があれば上書きする。提出済みの日報は、下書きに戻さない。 */
export async function saveReportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAppAccess(manifest.appKey);
  if (!actor.employee) return { error: NO_EMPLOYEE };
  const raw = Object.fromEntries([
    ["reportDate", String(formData.get("reportDate") ?? "")],
    ["intent", formData.get("intent")],
    ...TEXT_FIELDS.map((f) => [f, String(formData.get(f) ?? "")]),
    ["score", String(formData.get("score") ?? "")],
    ["scoreNote", String(formData.get("scoreNote") ?? "")],
  ]);
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { reportDate, intent, ...rest } = parsed.data;
  if (reportDate > actor.today) return { error: "明日より先の日報は書けません。" };
  const fields = rest as unknown as ReportFields;
  const trimmed = Object.fromEntries(TEXT_FIELDS.map((f) => [f, fields[f].trim()])) as Record<(typeof TEXT_FIELDS)[number], string>;
  const values = { ...trimmed, score: fields.score, scoreNote: fields.scoreNote.trim() };

  if (intent === "submit") {
    const problem = submitProblem(values);
    if (problem) return { error: problem };
  }

  const employeeId = actor.employee.id;
  const current = await getOwnReportByDate(employeeId, reportDate);
  const status = intent === "submit" || current?.status === "submitted" ? "submitted" : "draft";
  const submittedAt = current?.submittedAt ?? (status === "submitted" ? new Date() : null);

  let id: string;
  if (current) {
    await db.update(nippoReports).set({ ...values, status, submittedAt }).where(eq(nippoReports.id, current.id));
    id = current.id;
  } else {
    const [row] = await db
      .insert(nippoReports)
      .values({ employeeId, reportDate, authorUserId: actor.userId, ...values, status, submittedAt })
      .onConflictDoUpdate({
        target: [nippoReports.employeeId, nippoReports.reportDate],
        set: { ...values, status, submittedAt },
      })
      .returning({ id: nippoReports.id });
    id = row.id;
  }
  revalidate();
  return { ok: Date.now(), savedAs: status, reportId: id };
}

const idSchema = z.uuid();

/** 下書きの削除(本人だけ。提出済みの日報は消せない)。 */
export async function deleteDraftAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAppAccess(manifest.appKey);
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "不正なリクエストです。" };
  const current = await getReportRow(id.data);
  if (!current) return { ok: Date.now() };
  if (current.employeeId !== actor.employee?.id) return { error: NOT_FOUND };
  if (current.status !== "draft") return { error: "提出した日報は消せません。" };
  await db.transaction(async (tx) => {
    await tx.delete(nippoReports).where(eq(nippoReports.id, current.id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "nippo.report.delete",
      targetType: "nippo_report",
      targetId: current.id,
      before: { employeeId: current.employeeId, reportDate: current.reportDate, status: current.status },
    });
  });
  revalidate();
  return { ok: Date.now() };
}

const commentSchema = z.object({
  reportId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, "コメントを入力してください。")
    .max(COMMENT_MAX, `コメントは${COMMENT_MAX}文字以内で入力してください。`),
});

/** コメントを書く(指導者のフィードバック / 本人の返信)。 */
export async function addCommentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAppAccess(manifest.appKey);
  const parsed = commentSchema.safeParse({ reportId: formData.get("reportId"), body: String(formData.get("body") ?? "") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const report = await getReportRow(parsed.data.reportId);
  if (!report) return { error: NOT_FOUND };
  const mode = await modeForReport(actor, report);
  if (mode === "none") return { error: NOT_FOUND };
  if (report.status !== "submitted") return { error: "提出してから、コメントのやり取りができます。" };
  await db.insert(nippoComments).values({
    reportId: report.id,
    authorUserId: actor.userId,
    byOwner: mode === "owner",
    body: parsed.data.body,
  });
  revalidate();
  return { ok: Date.now() };
}

/** 自分のコメントを消す。 */
export async function deleteCommentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAppAccess(manifest.appKey);
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "不正なリクエストです。" };
  const current = await getComment(id.data);
  if (!current) return { ok: Date.now() };
  if (current.authorUserId !== actor.userId) return { error: "自分のコメントだけ消せます。" };
  await db.transaction(async (tx) => {
    await tx.delete(nippoComments).where(eq(nippoComments.id, current.id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "nippo.comment.delete",
      targetType: "nippo_comment",
      targetId: current.id,
      before: { reportId: current.reportId, byOwner: current.byOwner },
    });
  });
  revalidate();
  return { ok: Date.now() };
}

const memoSchema = z
  .string()
  .trim()
  .min(MEMO_MIN, `${MEMO_MIN}文字以上のメモを貼ってから押してください。`)
  .max(MEMO_MAX, `メモは${MEMO_MAX}文字以内にしてください。`);

/** 録音の文字起こし・メモを、日報の項目に振り分けた案を返す。DB は変えない。日報を書ける人(社員)だけ。 */
export async function sortMemoAction(memo: string): Promise<SortResult> {
  const actor = await requireAppAccess(manifest.appKey);
  if (!actor.employee) return { error: NO_EMPLOYEE };
  const parsed = memoSchema.safeParse(memo);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  return sortMemo(parsed.data);
}
