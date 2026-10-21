"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { canGlobally } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { audiences } from "@/modules/core/audience/schema";
import { writeAuditLog } from "@/modules/core/audit";
import { employees } from "@/modules/core/employees/schema";
import { isIsoDate } from "@/modules/core/shared/date";
import { COMPANY_CALENDAR } from "./company-calendar";
import {
  COMPANY_EVENT_KINDS,
  EVENT_KIND_LABEL,
  EVENT_NOTE_MAX,
  EVENT_RESPONSES,
  EVENT_TITLE_MAX,
  EVENTS_MANAGE,
  EVENT_VISIBILITIES,
  MAX_INVITEES,
} from "./constants";
import { getEditableEvent, getRespondableEvent } from "./event-queries";
import { isOffKind, requiresManage } from "./events";
import { dayInfo } from "./logic";
import { manifest } from "./manifest";
import { calendarCompanyEvents, calendarEventInvitees, calendarEventResponses, type CompanyEventRow } from "./schema";
import type { EventFormState, RespondState } from "./types";

// 全社の予定・参加の呼びかけの Server Action(docs/DESIGN.md 38 章)。
// 毎回 requireAppAccess(カレンダーを使えるか)を通し、引数を zod で検証する。休みの 2 種類・全社に表示・Audience への呼びかけは
// calendar.events.manage(全社)が必要。編集・削除は canEditEvent(getEditableEvent)を通す。全社の予定の変更は監査ログに記録する。

const EVENTS_ROUTE = `${manifest.route}/events`;

const eventSchema = z
  .object({
    kind: z.enum(COMPANY_EVENT_KINDS, "種類を選んでください。"),
    date: z.string().refine(isIsoDate, "日付が正しくありません。"),
    time: z
      .string()
      .trim()
      .regex(/^(|([01]\d|2[0-3]):[0-5]\d)$/, "時刻が正しくありません。")
      .transform((v) => (v === "" ? null : v)),
    title: z.string().trim().max(EVENT_TITLE_MAX, `名前は${EVENT_TITLE_MAX}文字以内で入力してください。`),
    note: z
      .string()
      .transform((v) => v.replace(/\r\n/g, "\n").trim())
      .refine((v) => v.length <= EVENT_NOTE_MAX, `メモは${EVENT_NOTE_MAX}文字以内で入力してください。`),
    visibility: z.enum(EVENT_VISIBILITIES, "見せる範囲を選んでください。"),
    audienceId: z
      .string()
      .transform((v) => (v === "" ? null : v))
      .pipe(z.uuid("呼びかける Audience が正しくありません。").nullable()),
    inviteeIds: z
      .array(z.uuid("呼びかける社員が正しくありません。"))
      .max(MAX_INVITEES, `名指しできるのは${MAX_INVITEES}人までです。`),
  })
  .transform((v) =>
    isOffKind(v.kind)
      ? // 休みの 2 種類は、全社に表示・時刻なし・呼びかけなし
        { ...v, time: null, visibility: "company" as const, audienceId: null, inviteeIds: [], title: v.title || EVENT_KIND_LABEL[v.kind] }
      : v,
  )
  .superRefine((v, ctx) => {
    if (v.kind === "event" && v.title === "") ctx.addIssue({ code: "custom", message: "予定の名前を入力してください。" });
  });

function parseEventForm(formData: FormData) {
  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };
  return eventSchema.safeParse({
    kind: text("kind"),
    date: text("date"),
    time: text("time"),
    title: text("title"),
    note: text("note"),
    visibility: text("visibility") || "invitees",
    audienceId: text("audienceId"),
    inviteeIds: [...new Set(formData.getAll("inviteeIds").filter((v): v is string => typeof v === "string"))],
  });
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力内容を確認してください。";
}

/** 監査ログに残す項目(メモの本文は残さない) */
function auditView(e: Pick<CompanyEventRow, "kind" | "date" | "time" | "title" | "visibility" | "audienceId">, inviteeCount: number) {
  return { kind: e.kind, date: e.date, time: e.time, title: e.title, visibility: e.visibility, audienceId: e.audienceId, inviteeCount };
}

function revalidateCalendar() {
  revalidatePath(manifest.route, "layout");
  revalidatePath("/");
}

/** 予定の登録・更新(id があれば更新)。保存したら予定・呼びかけの画面へ戻る。 */
export async function saveEventAction(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const actor = await requireAppAccess(manifest.appKey);
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId !== "" ? rawId : null;
  if (id !== null && !z.uuid().safeParse(id).success) return { error: "不正なリクエストです。" };
  const parsed = parseEventForm(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const v = parsed.data;
  const canManage = canGlobally(actor, EVENTS_MANAGE);

  if (requiresManage(v) && !canManage) {
    return { error: "全社の予定・休みの登録と、部署や拠点への呼びかけは、担当の人だけができます。" };
  }
  if (v.kind === "event" && v.visibility === "invitees" && v.inviteeIds.length === 0 && v.audienceId === null) {
    return {
      error: canManage
        ? "呼びかける相手を選ぶか、「全社に表示する」にしてください。自分だけの予定は、カレンダーの「メモ・予定」に書いてください。"
        : "呼びかける相手を 1 人以上選んでください。自分だけの予定は、カレンダーの「メモ・予定」に書いてください。",
    };
  }
  if (isOffKind(v.kind)) {
    const day = dayInfo(v.date, COMPANY_CALENDAR);
    if (day.kind === "unknown") return { error: `${v.date.slice(0, 4)}年の会社カレンダーがまだ登録されていないため、休みを登録できません。` };
    if (day.kind === "off") return { error: "その日は、もともと休みです。出勤日を選んでください。" };
  }

  // 相手の存在を確かめる(無効な Audience は選べない)
  if (v.audienceId) {
    const [a] = await db
      .select({ id: audiences.id })
      .from(audiences)
      .where(and(eq(audiences.id, v.audienceId), eq(audiences.isActive, true)));
    if (!a) return { error: "選んだ Audience が見つからないか、無効です。" };
  }
  if (v.inviteeIds.length > 0) {
    if (id === null && actor.employee && v.inviteeIds.includes(actor.employee.id)) return { error: "自分は呼びかける相手に入れられません。" };
    const found = await db.select({ id: employees.id }).from(employees).where(inArray(employees.id, v.inviteeIds));
    if (found.length !== v.inviteeIds.length) return { error: "呼びかける社員が見つかりません。画面を読み込み直してください。" };
  }

  const values = {
    kind: v.kind,
    date: v.date,
    time: v.time,
    title: v.title,
    note: v.note,
    visibility: v.visibility,
    audienceId: v.audienceId,
    updatedBy: actor.userId,
  };

  if (id === null) {
    await db.transaction(async (tx) => {
      const [created] = await tx.insert(calendarCompanyEvents).values({ ...values, createdBy: actor.userId }).returning();
      if (v.inviteeIds.length > 0) {
        await tx.insert(calendarEventInvitees).values(v.inviteeIds.map((employeeId) => ({ eventId: created.id, employeeId })));
      }
      if (created.visibility === "company") {
        await writeAuditLog(tx, {
          actorUserId: actor.userId,
          action: "calendar.event.create",
          targetType: "calendar_event",
          targetId: created.id,
          after: auditView(created, v.inviteeIds.length),
        });
      }
    });
  } else {
    const current = await getEditableEvent(actor, id);
    if (!current) return { error: "この予定は見つからないか、変更できません。" };
    // 全社に表示していた予定を、権限なしで変えることはできない(canEditEvent で確認済み)。
    const before = current.event;
    await db.transaction(async (tx) => {
      const [after] = await tx
        .update(calendarCompanyEvents)
        .set(values)
        .where(eq(calendarCompanyEvents.id, id))
        .returning();
      await tx.delete(calendarEventInvitees).where(eq(calendarEventInvitees.eventId, id));
      if (v.inviteeIds.length > 0) {
        await tx.insert(calendarEventInvitees).values(v.inviteeIds.map((employeeId) => ({ eventId: id, employeeId })));
      }
      // 日付・時刻を変えたら、返事はもう一度聞く
      if (before.date !== after.date || before.time !== after.time || after.kind !== "event") {
        await tx.delete(calendarEventResponses).where(eq(calendarEventResponses.eventId, id));
      }
      if (before.visibility === "company" || after.visibility === "company") {
        await writeAuditLog(tx, {
          actorUserId: actor.userId,
          action: "calendar.event.update",
          targetType: "calendar_event",
          targetId: id,
          before: auditView(before, current.inviteeIds.length),
          after: auditView(after, v.inviteeIds.length),
        });
      }
    });
  }

  revalidateCalendar();
  redirect(EVENTS_ROUTE);
}

/** 予定の削除(編集できる人だけ)。 */
export async function deleteEventAction(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const actor = await requireAppAccess(manifest.appKey);
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "不正なリクエストです。" };
  const current = await getEditableEvent(actor, id.data);
  if (!current) return { error: "この予定は見つからないか、削除できません。" };

  await db.transaction(async (tx) => {
    await tx.delete(calendarCompanyEvents).where(eq(calendarCompanyEvents.id, id.data));
    if (current.event.visibility === "company") {
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "calendar.event.delete",
        targetType: "calendar_event",
        targetId: id.data,
        before: auditView(current.event, current.inviteeIds.length),
      });
    }
  });
  revalidateCalendar();
  redirect(EVENTS_ROUTE);
}

const respondSchema = z.object({
  id: z.uuid("不正なリクエストです。"),
  response: z.enum(EVENT_RESPONSES, "参加か不参加を選んでください。"),
});

/** 参加・不参加の返事(相手で、予定の日が過ぎていないときだけ)。 */
export async function respondEventAction(_prev: RespondState, formData: FormData): Promise<RespondState> {
  const actor = await requireAppAccess(manifest.appKey);
  const parsed = respondSchema.safeParse({ id: formData.get("id"), response: formData.get("response") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const event = await getRespondableEvent(actor, parsed.data.id);
  if (!event) return { error: "この予定には返事ができません(呼びかけの相手でないか、日が過ぎています)。" };

  await db
    .insert(calendarEventResponses)
    .values({ eventId: event.id, userId: actor.userId, response: parsed.data.response })
    .onConflictDoUpdate({
      target: [calendarEventResponses.eventId, calendarEventResponses.userId],
      set: { response: parsed.data.response, respondedAt: new Date() },
    });
  revalidateCalendar();
  return { ok: Date.now() };
}
