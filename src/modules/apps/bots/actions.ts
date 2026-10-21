"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { requireGlobalPermission } from "@/modules/core/access";
import { writeAuditLog } from "@/modules/core/audit";
import { BOT_KIND_DEFS } from "./kinds";
import { MANAGE_PERMISSION, manifest } from "./manifest";
import { sendTrial } from "./run";
import { BOT_KINDS, botsBots } from "./schema";

// Bot の作成・変更・削除・試しの送信(docs/DESIGN.md 40 章)。画面以外からも呼べるため、毎回
// bots.manage(全社)で本判定し、引数を zod で検証し、変更は監査ログと同じトランザクションで記録する。

export type BotFormState = { error?: string; success?: string } | undefined;

const PAGE = manifest.route;
const Id = z.uuid("不正なリクエストです。");

const baseSchema = z.object({
  name: z.string().trim().min(1, "名前を入力してください。").max(60, "名前は60文字以内にしてください。"),
  kind: z.enum(BOT_KINDS, "種類を選んでください。"),
  channelId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,100}$/, "トークルームの channelId を入力してください(英数字とハイフン)。"),
  isEnabled: z.boolean(),
});

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

type Parsed = { ok: true; value: z.infer<typeof baseSchema> & { settings: Record<string, unknown> } } | { ok: false; error: string };

function parseBotForm(formData: FormData): Parsed {
  const base = baseSchema.safeParse({
    name: text(formData, "name"),
    kind: text(formData, "kind"),
    channelId: text(formData, "channelId"),
    isEnabled: formData.get("isEnabled") === "on",
  });
  if (!base.success) return { ok: false, error: base.error.issues[0]?.message ?? "入力内容を確認してください。" };
  const def = BOT_KIND_DEFS[base.data.kind];
  const settings = def.schema.safeParse(def.fromForm(formData));
  if (!settings.success) return { ok: false, error: settings.error.issues[0]?.message ?? "設定を確認してください。" };
  return { ok: true, value: { ...base.data, settings: settings.data } };
}

export async function createBotAction(_prev: BotFormState, formData: FormData): Promise<BotFormState> {
  const actor = await requireGlobalPermission(MANAGE_PERMISSION);
  const parsed = parseBotForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(botsBots)
      .values({ ...parsed.value, createdBy: actor.userId })
      .returning({ id: botsBots.id });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "bots.bot.create",
      targetType: "bots_bot",
      targetId: row.id,
      after: parsed.value,
    });
  });
  revalidatePath(PAGE);
  return { success: "作りました。「試しに送る」で、届くか確かめてください。" };
}

export async function updateBotAction(_prev: BotFormState, formData: FormData): Promise<BotFormState> {
  const actor = await requireGlobalPermission(MANAGE_PERMISSION);
  const id = Id.safeParse(text(formData, "id"));
  if (!id.success) return { error: "不正なリクエストです。" };
  const parsed = parseBotForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const error = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ name: botsBots.name, kind: botsBots.kind, channelId: botsBots.channelId, isEnabled: botsBots.isEnabled, settings: botsBots.settings })
      .from(botsBots)
      .where(eq(botsBots.id, id.data));
    if (!before) return "Bot が見つかりません。";
    if (before.kind !== parsed.value.kind) return "種類は変えられません。新しい Bot を作ってください。";
    await tx.update(botsBots).set(parsed.value).where(eq(botsBots.id, id.data));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "bots.bot.update",
      targetType: "bots_bot",
      targetId: id.data,
      before,
      after: parsed.value,
    });
    return null;
  });
  if (error) return { error };
  revalidatePath(PAGE);
  return { success: "保存しました。" };
}

export async function deleteBotAction(_prev: BotFormState, formData: FormData): Promise<BotFormState> {
  const actor = await requireGlobalPermission(MANAGE_PERMISSION);
  const id = Id.safeParse(text(formData, "id"));
  if (!id.success) return { error: "不正なリクエストです。" };
  const error = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(botsBots).where(eq(botsBots.id, id.data));
    if (!before) return "Bot が見つかりません。";
    await tx.delete(botsBots).where(eq(botsBots.id, id.data));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "bots.bot.delete",
      targetType: "bots_bot",
      targetId: id.data,
      before: { name: before.name, kind: before.kind, channelId: before.channelId, settings: before.settings },
    });
    return null;
  });
  if (error) return { error };
  revalidatePath(PAGE);
  return { success: "消しました。" };
}

export async function trialSendAction(_prev: BotFormState, formData: FormData): Promise<BotFormState> {
  await requireGlobalPermission(MANAGE_PERMISSION);
  const id = Id.safeParse(text(formData, "id"));
  if (!id.success) return { error: "不正なリクエストです。" };
  const result = await sendTrial(id.data);
  return result.ok ? { success: result.message } : { error: result.message };
}
