"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { requireGlobalPermission } from "../access";
import { writeAuditLog } from "../audit";
import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgErrorCode } from "../shared/db-errors";
import { todayJst } from "../shared/jst";
import { definitionSchema, type AudienceDefinition } from "./definition";
import { evaluateDefinition, getAudience, listAudienceUsages, loadPopulation } from "./queries";
import { audienceConditions, audienceGroups, audiences } from "./schema";

// Audience の Server Action。すべて core.audiences.manage(全社)で本判定し、変更は監査ログと同じトランザクションで記録する。

export type AudienceFormState = { error?: string; success?: string } | undefined;

const PREVIEW_LIMIT = 100;

export type PreviewResult =
  | {
      ok: true;
      count: number;
      shown: { employeeId: string; name: string; employeeNumber: string; affiliation: string }[];
    }
  | { ok: false; error: string };

function parseDefinition(json: string): { ok: true; definition: AudienceDefinition } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "条件の形式が正しくありません。" };
  }
  const parsed = definitionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "条件を確認してください。" };
  }
  return { ok: true, definition: parsed.data as AudienceDefinition };
}

const fieldsSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, "名前を入力してください。").max(50, "名前は50文字以内で入力してください。"),
  description: z.string().trim().max(200, "説明は200文字以内で入力してください。"),
});

/** 保存前の条件で、現在の対象者を確認する(保存はしない)。 */
export async function previewAudienceAction(definitionJson: string): Promise<PreviewResult> {
  await requireGlobalPermission("core.audiences.manage");
  const parsed = parseDefinition(definitionJson);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const today = todayJst();
  const population = await loadPopulation(today);
  const matched = evaluateDefinition(parsed.definition, population, today);
  return { ok: true, count: matched.length, shown: matched.slice(0, PREVIEW_LIMIT) };
}

export async function saveAudienceAction(
  _prev: AudienceFormState,
  formData: FormData,
): Promise<AudienceFormState> {
  const actor = await requireGlobalPermission("core.audiences.manage");
  const fields = fieldsSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  if (!fields.success) return { error: fields.error.issues[0]?.message ?? "入力内容を確認してください。" };
  const def = parseDefinition(String(formData.get("definition") ?? ""));
  if (!def.ok) return { error: def.error };
  const isActive = formData.get("isActive") === "on";
  const { id, name, description } = fields.data;
  const editing = id !== "";
  if (editing && !z.uuid().safeParse(id).success) return { error: "不正なリクエストです。" };

  let savedId: string;
  try {
    savedId = await db.transaction(async (tx) => {
      let audienceId = id;
      let before: unknown = null;
      if (editing) {
        const current = await getAudience(id);
        if (!current) throw new Error("NOT_FOUND");
        before = {
          name: current.name,
          description: current.description,
          isActive: current.isActive,
          definition: current.definition,
        };
        await tx.update(audiences).set({ name, description, isActive }).where(eq(audiences.id, id));
        await tx.delete(audienceGroups).where(eq(audienceGroups.audienceId, id)); // 条件は cascade で消える
      } else {
        const [created] = await tx.insert(audiences).values({ name, description, isActive }).returning();
        audienceId = created.id;
      }

      for (const [gi, group] of def.definition.groups.entries()) {
        const [g] = await tx
          .insert(audienceGroups)
          .values({ audienceId, sortOrder: gi })
          .returning({ id: audienceGroups.id });
        if (group.conditions.length > 0) {
          await tx.insert(audienceConditions).values(
            group.conditions.map((c, ci) => ({
              groupId: g.id,
              attribute: c.attribute,
              operator: c.operator,
              value: c.value,
              sortOrder: ci,
            })),
          );
        }
      }

      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: editing ? "audience.update" : "audience.create",
        targetType: "audience",
        targetId: audienceId,
        before,
        after: { name, description, isActive, definition: def.definition },
      });
      return audienceId;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") return { error: "Audience が見つかりません。" };
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) return { error: "この名前は既に使われています。" };
    throw err;
  }

  revalidatePath("/admin/audiences");
  revalidatePath(`/admin/audiences/${savedId}`);
  if (!editing) redirect(`/admin/audiences/${savedId}`);
  return { success: "保存しました。" };
}

export async function deleteAudienceAction(
  _prev: AudienceFormState,
  formData: FormData,
): Promise<AudienceFormState> {
  const actor = await requireGlobalPermission("core.audiences.manage");
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return { error: "不正なリクエストです。" };

  const current = await getAudience(id);
  if (!current) return { error: "Audience が見つかりません。" };
  // 利用中の Audience は削除できない(利用先が加わる後続の手順で、listAudienceUsages が実際の利用先を返す)。
  const usages = await listAudienceUsages(id);
  if (usages.length > 0) {
    return { error: `利用中のため削除できません(${usages.map((u) => u.name).join("、")})。` };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(audiences).where(eq(audiences.id, id));
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "audience.delete",
        targetType: "audience",
        targetId: id,
        before: {
          name: current.name,
          description: current.description,
          isActive: current.isActive,
          definition: current.definition,
        },
      });
    });
  } catch (err) {
    // 業務アプリ(教科書など)が使っている Audience は、DB の外部キーで削除が止まる(core はアプリの中を知らないため)。
    if (pgErrorCode(err) === PG_FOREIGN_KEY_VIOLATION) {
      return { error: "業務アプリ(教科書など)で利用中のため削除できません。先にアプリ側の設定を変えてください。" };
    }
    throw err;
  }

  revalidatePath("/admin/audiences");
  redirect("/admin/audiences");
}
