import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import { requireActor, type Actor } from "../access";
import { matchedAudienceIds } from "../audience";
import { audiences } from "../audience/schema";
import { appRegistry, type AppRegistryRow } from "./schema";

const ORDER = [asc(appRegistry.sortOrder), asc(appRegistry.displayName)];

/**
 * 見る人が使えるアプリ(有効で、宛先に当てはまるもの)。deny by default。
 * 1 回の表示の中で何度呼ばれても、DB を読むのは 1 回(React の cache)。
 */
export const listAppsForActor = cache(async (actor: Actor): Promise<AppRegistryRow[]> => {
  const rows = await db.select().from(appRegistry).where(eq(appRegistry.isEnabled, true)).orderBy(...ORDER);
  const matched = await matchedAudienceIds(
    actor.employee?.id ?? null,
    rows.flatMap((r) => (r.target === "audience" && r.audienceId ? [r.audienceId] : [])),
    actor.today,
  );
  return rows.filter((r) => r.target === "company" || (r.audienceId !== null && matched.has(r.audienceId)));
});

/** このアプリを使えるか。 */
export async function canAccessApp(actor: Actor, appKey: string): Promise<boolean> {
  const apps = await listAppsForActor(actor);
  return apps.some((a) => a.appKey === appKey);
}

/**
 * ポータルの中のアプリ(internal)のページの入口で呼ぶ。使えない人には 404 を返す(存在も知らせない)。
 * 初回のパスワード変更が済んでいない人は、変更画面へ送る。
 */
export async function requireAppAccess(appKey: string): Promise<Actor> {
  const actor = await requireActor();
  if (actor.mustChangePassword) redirect("/password");
  if (!(await canAccessApp(actor, appKey))) notFound();
  return actor;
}

export type AdminAppRow = AppRegistryRow & { audienceName: string | null };

export async function listAppsAdmin(): Promise<AdminAppRow[]> {
  const rows = await db
    .select({ app: appRegistry, audienceName: audiences.name })
    .from(appRegistry)
    .leftJoin(audiences, eq(appRegistry.audienceId, audiences.id))
    .orderBy(...ORDER);
  return rows.map((r) => ({ ...r.app, audienceName: r.audienceName }));
}
