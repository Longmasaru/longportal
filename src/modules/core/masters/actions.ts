"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAdmin } from "../access";
import { writeAuditLog } from "../audit";
import { PG_UNIQUE_VIOLATION, pgErrorCode } from "../shared/db-errors";
import { MASTER_LABEL, isMasterKey, type MasterKey } from "./config";
import { getMaster, insertMaster, updateMaster } from "./repo";

export type MasterFormState = { error?: string; success?: string } | undefined;

const baseFields = {
  name: z
    .string()
    .trim()
    .min(1, "名称を入力してください。")
    .max(50, "名称は50文字以内で入力してください。"),
  sortOrder: z.coerce.number().int("並び順は整数で入力してください。").min(0).max(9999),
};

const createSchema = z.object({
  ...baseFields,
  code: z
    .string()
    .trim()
    .min(1, "コードを入力してください。")
    .max(50)
    .regex(/^[a-z0-9_]+$/, "コードは半角の小文字英数字とアンダースコアで入力してください。"),
});

const updateSchema = z.object({ ...baseFields });

const positionFieldsSchema = z.object({
  rank: z.coerce.number().int("序列は整数で入力してください。").min(0).max(9999),
});

const checkbox = (formData: FormData, name: string) => formData.get(name) === "on";

function keyFrom(formData: FormData): MasterKey | null {
  const key = String(formData.get("key") ?? "");
  return isMasterKey(key) ? key : null;
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力内容を確認してください。";
}

export async function createMasterAction(
  _prev: MasterFormState,
  formData: FormData,
): Promise<MasterFormState> {
  const actor = await requireAdmin();
  const key = keyFrom(formData);
  if (!key) return { error: "不正なリクエストです。" };

  const raw = Object.fromEntries(formData);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  let rank: number | undefined;
  if (key === "positions") {
    const p = positionFieldsSchema.safeParse(raw);
    if (!p.success) return { error: firstIssue(p.error) };
    rank = p.data.rank;
  }

  try {
    await db.transaction(async (tx) => {
      const created = await insertMaster(tx, key, {
        ...parsed.data,
        isActive: true,
        isManagement: key === "positions" ? checkbox(formData, "isManagement") : undefined,
        rank,
      });
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "master.create",
        targetType: key,
        targetId: created.id,
        after: created,
      });
    });
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) return { error: "このコードは既に使われています。" };
    throw err;
  }

  revalidatePath(`/admin/organization/${key}`);
  return { success: `${MASTER_LABEL[key]}「${parsed.data.name}」を追加しました。` };
}

export async function updateMasterAction(
  _prev: MasterFormState,
  formData: FormData,
): Promise<MasterFormState> {
  const actor = await requireAdmin();
  const key = keyFrom(formData);
  const id = String(formData.get("id") ?? "");
  if (!key || !z.uuid().safeParse(id).success) return { error: "不正なリクエストです。" };

  const raw = Object.fromEntries(formData);
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  let rank: number | undefined;
  if (key === "positions") {
    const p = positionFieldsSchema.safeParse(raw);
    if (!p.success) return { error: firstIssue(p.error) };
    rank = p.data.rank;
  }

  const result = await db.transaction(async (tx) => {
    const before = await getMaster(key, id);
    if (!before) return null;
    const after = await updateMaster(tx, key, id, {
      ...parsed.data,
      isActive: checkbox(formData, "isActive"),
      isManagement: key === "positions" ? checkbox(formData, "isManagement") : undefined,
      rank,
    });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "master.update",
      targetType: key,
      targetId: id,
      before,
      after,
    });
    return after;
  });
  if (!result) return { error: "対象が見つかりません。" };

  revalidatePath(`/admin/organization/${key}`);
  return { success: "保存しました。" };
}
