"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAppAccess } from "@/modules/core/apps";
import { isIsoDate } from "@/modules/core/shared/date";
import { manifest } from "./manifest";
import { calendarEntries } from "./schema";
import type { EntryFormState } from "./types";

// メモ・予定は本人だけのデータ。requireAppAccess(アプリを使えるか)を通し、すべての操作を
// ログイン中の user_id でスコープする(更新・削除は WHERE id AND user_id で、他人のデータには触れられない)。

const fieldsSchema = z.object({
  date: z.string().refine(isIsoDate, "日付が正しくありません。"),
  time: z
    .string()
    .trim()
    .regex(/^(|([01]\d|2[0-3]):[0-5]\d)$/, "時刻が正しくありません。")
    .transform((v) => (v === "" ? null : v)),
  title: z
    .string()
    .trim()
    .min(1, "内容を入力してください。")
    .max(100, "内容は100文字以内で入力してください。"),
  note: z.string().trim().max(1000, "メモは1000文字以内で入力してください。"),
});

const idSchema = z.uuid();

async function requireUserId(): Promise<string> {
  const actor = await requireAppAccess(manifest.appKey);
  return actor.userId;
}

function fieldsFrom(formData: FormData) {
  return fieldsSchema.safeParse({
    date: String(formData.get("date") ?? ""),
    time: String(formData.get("time") ?? ""),
    title: String(formData.get("title") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力内容を確認してください。";
}

export async function createEntryAction(_prev: EntryFormState, formData: FormData): Promise<EntryFormState> {
  const userId = await requireUserId();
  const parsed = fieldsFrom(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await db.insert(calendarEntries).values({ userId, ...parsed.data });
  revalidatePath(manifest.route);
  return { ok: Date.now() };
}

export async function updateEntryAction(_prev: EntryFormState, formData: FormData): Promise<EntryFormState> {
  const userId = await requireUserId();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "不正なリクエストです。" };
  const parsed = fieldsFrom(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const updated = await db
    .update(calendarEntries)
    .set(parsed.data)
    .where(and(eq(calendarEntries.id, id.data), eq(calendarEntries.userId, userId)))
    .returning({ id: calendarEntries.id });
  if (updated.length === 0) return { error: "見つかりませんでした。画面を再読み込みしてください。" };
  revalidatePath(manifest.route);
  return { ok: Date.now() };
}

export async function deleteEntryAction(_prev: EntryFormState, formData: FormData): Promise<EntryFormState> {
  const userId = await requireUserId();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "不正なリクエストです。" };

  await db
    .delete(calendarEntries)
    .where(and(eq(calendarEntries.id, id.data), eq(calendarEntries.userId, userId)));
  revalidatePath(manifest.route);
  return { ok: Date.now() };
}
