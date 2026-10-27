"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { writeAuditLog } from "@/modules/core/audit";
import { isIsoDate } from "@/modules/core/shared/date";
import { HOMETOWN_MAX, NATIVE_NAME_MAX, NICKNAME_MAX, NOTE_MAX, RESIDENCE_STATUSES } from "./constants";
import { managerOrNull } from "./guard";
import { listAddableEmployees } from "./queries";
import { nakamaMembers } from "./schema";
import type { NakamaFormState } from "./types";

// 名簿の Server Action(docs/DESIGN.md 43 章)。画面以外からも呼べるため、毎回
// requireAppAccess と、名簿の管理の権限(nakama.members.manage、全社)を確かめる。
// 監査ログには、変えた項目名だけを残す(名前・日付などの値は残さない)。

const BASE = "/apps/nakama";
const DENIED = "名簿を直す権限がありません。";
const Id = z.uuid("不正なリクエストです。");

const optionalDate = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || isIsoDate(v), `${label}が正しくありません。`)
    .transform((v) => (v === "" ? null : v));

const text = (label: string, max: number) =>
  z.string().trim().max(max, `${label}は${max}文字以内で入力してください。`);

const Fields = z.object({
  nickname: text("呼び名", NICKNAME_MAX),
  nativeName: text("ベトナム語の名前", NATIVE_NAME_MAX),
  arrivedOn: optionalDate("日本に来た日"),
  hometown: text("出身", HOMETOWN_MAX),
  note: text("ひとこと", NOTE_MAX),
  residenceStatus: z
    .union([z.literal(""), z.enum(RESIDENCE_STATUSES)], "在留資格を選び直してください。")
    .transform((v) => (v === "" ? null : v)),
  residenceExpiresOn: optionalDate("在留期限"),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力内容を確認してください。";
}

/** 名簿に人を足す。足したら、その人の編集の画面へ。 */
export async function addMemberAction(_prev: NakamaFormState, formData: FormData): Promise<NakamaFormState> {
  const actor = await managerOrNull();
  if (!actor) return { error: DENIED };
  const id = Id.safeParse(formData.get("employeeId"));
  if (!id.success) return { error: "名簿に載せる人を選んでください。" };
  const addable = await listAddableEmployees(actor.today);
  if (!addable.some((e) => e.employeeId === id.data)) return { error: "この人は名簿に足せません(在籍していないか、もう載っています)。" };

  await db.transaction(async (tx) => {
    await tx.insert(nakamaMembers).values({ employeeId: id.data, updatedByUserId: actor.userId });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "nakama.member.create",
      targetType: "nakama.member",
      targetId: id.data,
    });
  });
  revalidatePath(BASE);
  redirect(`${BASE}/manage/${id.data}?added=1`);
}

/** 名簿の 1 人の内容を直す。 */
export async function updateMemberAction(_prev: NakamaFormState, formData: FormData): Promise<NakamaFormState> {
  const actor = await managerOrNull();
  if (!actor) return { error: DENIED };
  const id = Id.safeParse(formData.get("employeeId"));
  if (!id.success) return { error: id.error.issues[0]?.message };
  const parsed = Fields.safeParse({
    nickname: String(formData.get("nickname") ?? ""),
    nativeName: String(formData.get("nativeName") ?? ""),
    arrivedOn: String(formData.get("arrivedOn") ?? ""),
    hometown: String(formData.get("hometown") ?? ""),
    note: String(formData.get("note") ?? ""),
    residenceStatus: String(formData.get("residenceStatus") ?? ""),
    residenceExpiresOn: String(formData.get("residenceExpiresOn") ?? ""),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const values = parsed.data;
  if (values.arrivedOn && values.arrivedOn > actor.today) return { error: "日本に来た日に、先の日付は入れられません。" };

  const changed = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(nakamaMembers).where(eq(nakamaMembers.employeeId, id.data)).limit(1);
    if (!before) return null;
    const fields = (Object.keys(values) as (keyof typeof values)[]).filter((k) => before[k] !== values[k]);
    if (fields.length === 0) return fields;
    await tx
      .update(nakamaMembers)
      .set({ ...values, updatedByUserId: actor.userId })
      .where(eq(nakamaMembers.employeeId, id.data));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "nakama.member.update",
      targetType: "nakama.member",
      targetId: id.data,
      after: { fields },
    });
    return fields;
  });
  if (changed === null) return { error: "この人は名簿にいません。" };
  revalidatePath(BASE, "layout");
  return { success: changed.length === 0 ? "変わったところはありません。" : "保存しました。" };
}

/** 名簿から外す(社員マスタはそのまま。入力した呼び名などは消える)。 */
export async function removeMemberAction(formData: FormData): Promise<void> {
  const actor = await managerOrNull();
  if (!actor) return;
  const id = Id.safeParse(formData.get("employeeId"));
  if (!id.success) return;
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(nakamaMembers)
      .where(eq(nakamaMembers.employeeId, id.data))
      .returning({ id: nakamaMembers.employeeId });
    if (removed.length === 0) return;
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "nakama.member.delete",
      targetType: "nakama.member",
      targetId: id.data,
    });
  });
  revalidatePath(BASE, "layout");
  redirect(`${BASE}/manage`);
}
