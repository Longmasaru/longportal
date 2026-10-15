import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import type { Actor } from "../access";
import { matchedAudienceIds } from "../audience";
import { audiences } from "../audience/schema";
import { portalLinks, type PortalLink } from "./schema";

const ORDER = [asc(portalLinks.sortOrder), asc(portalLinks.title)];

/** 見る人に表示する社内リンク(有効で、宛先に当てはまるもの)。deny by default。 */
export async function listLinksForActor(actor: Actor): Promise<PortalLink[]> {
  const rows = await db.select().from(portalLinks).where(eq(portalLinks.isActive, true)).orderBy(...ORDER);
  const matched = await matchedAudienceIds(
    actor.employee?.id ?? null,
    rows.flatMap((r) => (r.target === "audience" && r.audienceId ? [r.audienceId] : [])),
    actor.today,
  );
  return rows.filter((r) => r.target === "company" || (r.audienceId !== null && matched.has(r.audienceId)));
}

export type AdminLinkRow = PortalLink & { audienceName: string | null };

export async function listLinksAdmin(): Promise<AdminLinkRow[]> {
  const rows = await db
    .select({ link: portalLinks, audienceName: audiences.name })
    .from(portalLinks)
    .leftJoin(audiences, eq(portalLinks.audienceId, audiences.id))
    .orderBy(...ORDER);
  return rows.map((r) => ({ ...r.link, audienceName: r.audienceName }));
}
