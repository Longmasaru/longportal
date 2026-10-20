"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGlobalPermission } from "@/modules/core/access";
import { MANAGE_PERMISSION } from "./manifest";
import { syncBook } from "./sync";

// 管理画面の「今すぐ取り込む」。毎日の定時の同期を待たずに、元の Google ドキュメントから取り込み直す。
// kyokasho.books.manage(全社)で本判定する。監査ログは取り込み直したときだけ(store.ts)。

export type SyncFormState = { error?: string; success?: string } | undefined;

export async function syncBookAction(_prev: SyncFormState, formData: FormData): Promise<SyncFormState> {
  const actor = await requireGlobalPermission(MANAGE_PERMISSION);
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "不正なリクエストです。" };
  const outcome = await syncBook(id.data, { actorUserId: actor.userId, trigger: "manual" });
  if (outcome.status === "updated") revalidatePath("/apps/kyokasho", "layout");
  return outcome.status === "error" || outcome.status === "skipped"
    ? { error: outcome.message }
    : { success: outcome.message };
}
