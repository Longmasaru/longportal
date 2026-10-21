"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { writeAuditLog } from "@/modules/core/audit";
import { isIsoDate } from "@/modules/core/shared/date";
import { BODY_MAX, POLISH_MIN, RECORD_KINDS, RECORD_VISIBILITIES, TITLE_MAX } from "./labels";
import { manifest } from "./manifest";
import { DENIED, recordWriterFor } from "./guard";
import { canEditRecord, maskName, writableVisibilities } from "./logic";
import { polishRecordBody, type PolishResult } from "./polish";
import { getNameParts, getRecord } from "./queries";
import { hrRecords } from "./schema";
import type { RecordFormState } from "./types";

// 記録の Server Action(docs/DESIGN.md 31 章)。画面以外からも呼べるため、毎回
// requireAppAccess(アプリを使えるか)と、対象の社員の記録を書けるか(hr.records.manage + 今日の所属、または上司。31.4)を判定する。
// 上司が書けるのは「本人に公開」「上司まで」だけで、直せる・消せるのは自分が書いた記録だけ。
// 自分についての記録は、権限があっても書けない(pageMode が self になる)。

const fieldsSchema = z.object({
  kind: z.enum(RECORD_KINDS, "種類を選んでください。"),
  occurredOn: z.string().refine(isIsoDate, "日付が正しくありません。"),
  title: z
    .string()
    .trim()
    .min(1, "件名を入力してください。")
    .max(TITLE_MAX, `件名は${TITLE_MAX}文字以内で入力してください。`),
  body: z.string().trim().max(BODY_MAX, `内容は${BODY_MAX}文字以内で入力してください。`),
  visibility: z.enum(RECORD_VISIBILITIES, "公開範囲を選んでください。"),
});

const idSchema = z.uuid();

const VISIBILITY_DENIED = "この公開範囲では書けません。";
const EDIT_DENIED = "この記録を直す権限がありません(上司が直せるのは、自分が書いた記録だけです)。";

function fieldsFrom(formData: FormData) {
  return fieldsSchema.safeParse({
    kind: formData.get("kind"),
    occurredOn: String(formData.get("occurredOn") ?? ""),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    visibility: formData.get("visibility"),
  });
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力内容を確認してください。";
}

/** 監査ログに残す内容(本文は残さない)。 */
function auditSummary(r: { employeeId: string; kind: string; occurredOn: string; visibility: string }) {
  return { employeeId: r.employeeId, kind: r.kind, occurredOn: r.occurredOn, visibility: r.visibility };
}

export async function createRecordAction(_prev: RecordFormState, formData: FormData): Promise<RecordFormState> {
  const employeeId = idSchema.safeParse(formData.get("employeeId"));
  if (!employeeId.success) return { error: "不正なリクエストです。" };
  const writer = await recordWriterFor(employeeId.data);
  if (!writer) return { error: DENIED };
  const { actor } = writer;
  const parsed = fieldsFrom(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!writableVisibilities(writer.mode).includes(parsed.data.visibility)) return { error: VISIBILITY_DENIED };

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(hrRecords)
      .values({ employeeId: employeeId.data, authorUserId: actor.userId, ...parsed.data })
      .returning();
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "hr.record.create",
      targetType: "hr_record",
      targetId: row.id,
      after: auditSummary(row),
    });
  });
  revalidatePath(manifest.route, "layout");
  return { ok: Date.now() };
}

export async function updateRecordAction(_prev: RecordFormState, formData: FormData): Promise<RecordFormState> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "不正なリクエストです。" };
  const current = await getRecord(id.data);
  if (!current) return { error: "見つかりませんでした。画面を再読み込みしてください。" };
  const writer = await recordWriterFor(current.employeeId);
  if (!writer || !canEditRecord(writer.mode, current, writer.actor.userId)) return { error: EDIT_DENIED };
  const { actor } = writer;
  const parsed = fieldsFrom(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!writableVisibilities(writer.mode).includes(parsed.data.visibility)) return { error: VISIBILITY_DENIED };

  await db.transaction(async (tx) => {
    const [row] = await tx.update(hrRecords).set(parsed.data).where(eq(hrRecords.id, current.id)).returning();
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "hr.record.update",
      targetType: "hr_record",
      targetId: current.id,
      before: auditSummary(current),
      after: auditSummary(row),
    });
  });
  revalidatePath(manifest.route, "layout");
  return { ok: Date.now() };
}

export async function deleteRecordAction(_prev: RecordFormState, formData: FormData): Promise<RecordFormState> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "不正なリクエストです。" };
  const current = await getRecord(id.data);
  if (!current) return { ok: Date.now() };
  const writer = await recordWriterFor(current.employeeId);
  if (!writer || !canEditRecord(writer.mode, current, writer.actor.userId)) return { error: EDIT_DENIED };
  const { actor } = writer;

  await db.transaction(async (tx) => {
    await tx.delete(hrRecords).where(eq(hrRecords.id, current.id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "hr.record.delete",
      targetType: "hr_record",
      targetId: current.id,
      before: auditSummary(current),
    });
  });
  revalidatePath(manifest.route, "layout");
  return { ok: Date.now() };
}

const polishSchema = z.object({
  employeeId: z.uuid(),
  kind: z.enum(RECORD_KINDS),
  body: z
    .string()
    .trim()
    .min(POLISH_MIN, `${POLISH_MIN}文字以上書いてから押してください。`)
    .max(BODY_MAX, `内容は${BODY_MAX}文字以内にしてください。`),
});

/**
 * 記録の内容を AI で整えた案を返す(31.3)。DB は変えない。
 * 対象の社員の記録を書ける人(管理する人・上司)だけ。送る前に、対象の社員の氏名を「本人」に置き換える。
 */
export async function polishRecordBodyAction(input: { employeeId: string; kind: string; body: string }): Promise<PolishResult> {
  const parsed = polishSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!(await recordWriterFor(parsed.data.employeeId))) return { error: DENIED };
  const name = await getNameParts(parsed.data.employeeId);
  if (!name) return { error: "不正なリクエストです。" };
  return polishRecordBody(parsed.data.kind, maskName(parsed.data.body, name));
}
