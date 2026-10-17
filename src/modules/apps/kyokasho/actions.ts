"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { requireGlobalPermission } from "@/modules/core/access";
import { audiences } from "@/modules/core/audience/schema";
import { writeAuditLog } from "@/modules/core/audit";
import { MANAGE_PERMISSION } from "./manifest";
import { kyokashoBooks } from "./schema";

// 教科書の設定の変更(公開・見られる人・表示)。kyokasho.books.manage(全社)で本判定し、監査ログと同じトランザクションで記録する。
// 中身の取り込みは scripts/import-kyokasho.ts(画面からは行わない)。

export type BookFormState = { error?: string; success?: string } | undefined;

const sourceUrlSchema = z
  .string()
  .trim()
  .max(2000, "URL が長すぎます。")
  .refine((v) => v === "" || /^https:\/\//.test(v), "元のドキュメントの URL は https:// で始まる形で入力してください。");

const settingsSchema = z
  .object({
    id: z.uuid("不正なリクエストです。"),
    department: z.string().trim().min(1, "まとまり(部署)を入力してください。").max(40, "まとまりは40文字以内にしてください。"),
    title: z.string().trim().min(1, "題名を入力してください。").max(80, "題名は80文字以内にしてください。"),
    description: z.string().trim().max(300, "説明は300文字以内にしてください。"),
    sortOrder: z.coerce.number().int("並び順は整数で入力してください。").min(0).max(9999),
    target: z.enum(["company", "audience"], "見られる人を選択してください。"),
    audienceId: z.string(),
    isPublished: z.boolean(),
    sourceUrl: sourceUrlSchema,
  })
  .superRefine((v, ctx) => {
    if (v.target === "audience" && !z.uuid().safeParse(v.audienceId).success) {
      ctx.addIssue({ code: "custom", message: "見られる人の Audience を選択してください。" });
    }
  });

export async function updateBookAction(_prev: BookFormState, formData: FormData): Promise<BookFormState> {
  const actor = await requireGlobalPermission(MANAGE_PERMISSION);
  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };
  const parsed = settingsSchema.safeParse({
    id: text("id"),
    department: text("department"),
    title: text("title"),
    description: text("description"),
    sortOrder: text("sortOrder") || "0",
    target: text("target"),
    audienceId: text("audienceId"),
    isPublished: formData.get("isPublished") === "on",
    sourceUrl: text("sourceUrl"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  const { id, ...v } = parsed.data;
  const audienceId = v.target === "audience" ? v.audienceId : null;
  if (audienceId) {
    const [a] = await db
      .select({ id: audiences.id })
      .from(audiences)
      .where(and(eq(audiences.id, audienceId), eq(audiences.isActive, true)));
    if (!a) return { error: "選んだ Audience が見つからないか、無効です。" };
  }

  const error = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({
        department: kyokashoBooks.department,
        title: kyokashoBooks.title,
        description: kyokashoBooks.description,
        sortOrder: kyokashoBooks.sortOrder,
        target: kyokashoBooks.target,
        audienceId: kyokashoBooks.audienceId,
        isPublished: kyokashoBooks.isPublished,
        sourceUrl: kyokashoBooks.sourceUrl,
      })
      .from(kyokashoBooks)
      .where(eq(kyokashoBooks.id, id));
    if (!before) return "教科書が見つかりません。";
    const after = { ...v, audienceId };
    await tx.update(kyokashoBooks).set(after).where(eq(kyokashoBooks.id, id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "kyokasho.book.update",
      targetType: "kyokasho_book",
      targetId: id,
      before,
      after,
    });
    return null;
  });
  if (error) return { error };
  revalidatePath("/apps/kyokasho", "layout");
  return { success: "保存しました。" };
}
