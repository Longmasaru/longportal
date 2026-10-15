"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { requireGlobalPermission } from "../access";
import { audiences } from "../audience/schema";
import { writeAuditLog } from "../audit";
import { PG_UNIQUE_VIOLATION, pgErrorCode } from "../shared/db-errors";
import { APP_ICONS, APP_KEY_PATTERN, APP_TARGETS } from "./constants";
import { appRegistry } from "./schema";

// アプリの登録簿の Server Action。core.apps.manage(全社)で本判定し、変更は監査ログと同じトランザクションで記録する。

export type AppFormState = { error?: string; success?: string } | undefined;

const urlSchema = z
  .string()
  .trim()
  .max(2000, "URL が長すぎます。")
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === "https:" || u.protocol === "http:") && /^https?:\/\//.test(v);
    } catch {
      return false;
    }
  }, "URL は https:// で始まる形で入力してください。");

const settingsSchema = z
  .object({
    displayName: z.string().trim().min(1, "表示名を入力してください。").max(40, "表示名は40文字以内にしてください。"),
    description: z.string().trim().max(200, "説明は200文字以内にしてください。"),
    icon: z.enum(APP_ICONS, "アイコンを選択してください。"),
    target: z.enum(APP_TARGETS, "表示する相手を選択してください。"),
    audienceId: z.string(),
    sortOrder: z.coerce.number().int("並び順は整数で入力してください。").min(0).max(9999),
    isEnabled: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.target === "audience" && !z.uuid().safeParse(v.audienceId).success) {
      ctx.addIssue({ code: "custom", message: "表示する Audience を選択してください。" });
    }
  });

function read(formData: FormData) {
  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };
  return {
    text,
    settings: settingsSchema.safeParse({
      displayName: text("displayName"),
      description: text("description"),
      icon: text("icon"),
      target: text("target"),
      audienceId: text("audienceId"),
      sortOrder: text("sortOrder") || "0",
      isEnabled: formData.get("isEnabled") === "on",
    }),
  };
}

async function activeAudienceExists(id: string): Promise<boolean> {
  const [a] = await db
    .select({ id: audiences.id })
    .from(audiences)
    .where(and(eq(audiences.id, id), eq(audiences.isActive, true)));
  return Boolean(a);
}

/** 登録済みのアプリの運用設定を変える(internal / external 共通。external は URL も)。 */
export async function updateAppAction(_prev: AppFormState, formData: FormData): Promise<AppFormState> {
  const actor = await requireGlobalPermission("core.apps.manage");
  const { text, settings } = read(formData);
  const appKey = text("appKey");
  if (!APP_KEY_PATTERN.test(appKey)) return { error: "不正なリクエストです。" };
  if (!settings.success) return { error: settings.error.issues[0]?.message ?? "入力内容を確認してください。" };
  const v = settings.data;
  if (v.target === "audience" && !(await activeAudienceExists(v.audienceId))) {
    return { error: "選んだ Audience が見つからないか、無効です。" };
  }

  const error = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(appRegistry).where(eq(appRegistry.appKey, appKey));
    if (!before) return "アプリが見つかりません。";
    let url = before.url;
    if (before.kind === "external") {
      const parsedUrl = urlSchema.safeParse(text("url"));
      if (!parsedUrl.success) return parsedUrl.error.issues[0]?.message ?? "URL を確認してください。";
      url = parsedUrl.data;
    }
    if (before.kind === "internal" && !before.inManifest && v.isEnabled) {
      return "このアプリはコードから削除されているため、有効にできません。";
    }
    const [after] = await tx
      .update(appRegistry)
      .set({ ...v, audienceId: v.target === "audience" ? v.audienceId : null, url })
      .where(eq(appRegistry.appKey, appKey))
      .returning();
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "app.update",
      targetType: "app",
      targetId: appKey,
      before,
      after,
    });
    return null;
  });
  if (error) return { error };
  revalidatePath("/", "layout");
  return { success: "保存しました。" };
}

/** 別プロジェクトのアプリ(external)を登録する。最初は無効(誰にも見えない)で始める。 */
export async function createExternalAppAction(_prev: AppFormState, formData: FormData): Promise<AppFormState> {
  const actor = await requireGlobalPermission("core.apps.manage");
  const { text, settings } = read(formData);
  const appKey = text("appKey").trim();
  if (!APP_KEY_PATTERN.test(appKey)) {
    return { error: "アプリの ID は、半角の小文字で始まる、小文字・数字・_ - の 2〜40 文字にしてください。" };
  }
  const parsedUrl = urlSchema.safeParse(text("url"));
  if (!parsedUrl.success) return { error: parsedUrl.error.issues[0]?.message ?? "URL を確認してください。" };
  if (!settings.success) return { error: settings.error.issues[0]?.message ?? "入力内容を確認してください。" };
  const v = settings.data;
  if (v.target === "audience" && !(await activeAudienceExists(v.audienceId))) {
    return { error: "選んだ Audience が見つからないか、無効です。" };
  }

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(appRegistry)
        .values({
          ...v,
          audienceId: v.target === "audience" ? v.audienceId : null,
          appKey,
          kind: "external",
          url: parsedUrl.data,
          route: null,
        })
        .returning();
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "app.create",
        targetType: "app",
        targetId: appKey,
        after: created,
      });
    });
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) return { error: "このアプリの ID は、すでに使われています。" };
    throw err;
  }
  revalidatePath("/", "layout");
  return { success: "アプリを登録しました。" };
}

/** 別プロジェクトのアプリ(external)の登録を消す。internal は消せない(コードから消すと自動で無効になる)。 */
export async function deleteExternalAppAction(_prev: AppFormState, formData: FormData): Promise<AppFormState> {
  const actor = await requireGlobalPermission("core.apps.manage");
  const appKey = String(formData.get("appKey") ?? "");
  if (!APP_KEY_PATTERN.test(appKey)) return { error: "不正なリクエストです。" };
  const error = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(appRegistry).where(eq(appRegistry.appKey, appKey));
    if (!before) return "アプリが見つかりません。";
    if (before.kind !== "external") return "ポータルの中のアプリは削除できません。無効にしてください。";
    await tx.delete(appRegistry).where(eq(appRegistry.appKey, appKey));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "app.delete",
      targetType: "app",
      targetId: appKey,
      before,
    });
    return null;
  });
  if (error) return { error };
  revalidatePath("/", "layout");
  return { success: "削除しました。" };
}
