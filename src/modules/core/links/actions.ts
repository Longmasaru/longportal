"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { requireGlobalPermission } from "../access";
import { audiences } from "../audience/schema";
import { writeAuditLog } from "../audit";
import { portalLinks } from "./schema";

// 社内リンクの Server Action。core.links.manage(全社)で本判定し、変更は監査ログと同じトランザクションで記録する。

export type LinkFormState = { error?: string; success?: string } | undefined;

const linkSchema = z
  .object({
    title: z.string().trim().min(1, "表示名を入力してください。").max(40, "表示名は40文字以内にしてください。"),
    url: z
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
      }, "URL は https:// で始まる形で入力してください。"),
    description: z.string().trim().max(100, "説明は100文字以内にしてください。"),
    target: z.enum(["company", "audience"], "表示する相手を選択してください。"),
    audienceId: z.string(),
    sortOrder: z.coerce.number().int("並び順は整数で入力してください。").min(0).max(9999),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.target === "audience" && !z.uuid().safeParse(v.audienceId).success) {
      ctx.addIssue({ code: "custom", message: "表示する Audience を選択してください。" });
    }
  });

function parse(formData: FormData) {
  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };
  return linkSchema.safeParse({
    title: text("title"),
    url: text("url"),
    description: text("description"),
    target: text("target"),
    audienceId: text("audienceId"),
    sortOrder: text("sortOrder") || "0",
    isActive: formData.get("isActive") === "on",
  });
}

/** 社内リンクの追加・更新(id があれば更新)。 */
export async function saveLinkAction(_prev: LinkFormState, formData: FormData): Promise<LinkFormState> {
  const actor = await requireGlobalPermission("core.links.manage");
  const rawId = formData.get("id");
  const id = typeof rawId === "string" ? rawId : "";
  if (id !== "" && !z.uuid().safeParse(id).success) return { error: "不正なリクエストです。" };
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  const v = parsed.data;
  if (v.target === "audience") {
    const [a] = await db
      .select({ id: audiences.id })
      .from(audiences)
      .where(and(eq(audiences.id, v.audienceId), eq(audiences.isActive, true)));
    if (!a) return { error: "選んだ Audience が見つからないか、無効です。" };
  }
  const values = { ...v, audienceId: v.target === "audience" ? v.audienceId : null };

  const ok = await db.transaction(async (tx) => {
    if (id === "") {
      const [created] = await tx.insert(portalLinks).values(values).returning();
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "link.create",
        targetType: "link",
        targetId: created.id,
        after: created,
      });
      return true;
    }
    const [before] = await tx.select().from(portalLinks).where(eq(portalLinks.id, id));
    if (!before) return false;
    const [after] = await tx.update(portalLinks).set(values).where(eq(portalLinks.id, id)).returning();
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "link.update",
      targetType: "link",
      targetId: id,
      before,
      after,
    });
    return true;
  });
  if (!ok) return { error: "社内リンクが見つかりません。" };
  revalidatePath("/", "layout");
  return { success: id === "" ? "社内リンクを追加しました。" : "保存しました。" };
}

/** 社内リンクの削除。 */
export async function deleteLinkAction(_prev: LinkFormState, formData: FormData): Promise<LinkFormState> {
  const actor = await requireGlobalPermission("core.links.manage");
  const parsed = z.uuid().safeParse(formData.get("id"));
  if (!parsed.success) return { error: "不正なリクエストです。" };
  const ok = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(portalLinks).where(eq(portalLinks.id, parsed.data));
    if (!before) return false;
    await tx.delete(portalLinks).where(eq(portalLinks.id, before.id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "link.delete",
      targetType: "link",
      targetId: before.id,
      before,
    });
    return true;
  });
  if (!ok) return { error: "社内リンクが見つかりません。" };
  revalidatePath("/", "layout");
  return { success: "削除しました。" };
}
