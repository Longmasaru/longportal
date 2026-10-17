import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { compareSessions } from "./policy";
import { aiMaterials, aiSessions } from "./schema";

// AI教室の読み取り(docs/DESIGN.md 28 章)。回と資料は、アプリを使える人なら全員が見られる。

export type MaterialRow = { id: string; fileName: string; size: number; contentType: string };
export type SessionRow = { id: string; title: string; heldOn: string | null; materials: MaterialRow[] };

/** 回と資料の一覧(回は実施日順、資料は並び順・登録順)。 */
export async function listSessionsWithMaterials(): Promise<SessionRow[]> {
  const sessions = await db
    .select({
      id: aiSessions.id,
      title: aiSessions.title,
      heldOn: aiSessions.heldOn,
      sortOrder: aiSessions.sortOrder,
      createdAt: aiSessions.createdAt,
    })
    .from(aiSessions);
  const materials = await db
    .select({
      id: aiMaterials.id,
      sessionId: aiMaterials.sessionId,
      fileName: aiMaterials.fileName,
      size: aiMaterials.size,
      contentType: aiMaterials.contentType,
    })
    .from(aiMaterials)
    .orderBy(asc(aiMaterials.sortOrder), asc(aiMaterials.createdAt));

  const bySession = new Map<string, MaterialRow[]>();
  for (const { sessionId, ...m } of materials) {
    const list = bySession.get(sessionId) ?? [];
    list.push(m);
    bySession.set(sessionId, list);
  }
  return sessions
    .sort(compareSessions)
    .map((s) => ({ id: s.id, title: s.title, heldOn: s.heldOn, materials: bySession.get(s.id) ?? [] }));
}

export async function getMaterial(id: string) {
  const [row] = await db.select().from(aiMaterials).where(eq(aiMaterials.id, id)).limit(1);
  return row ?? null;
}

export async function getSession(id: string) {
  const [row] = await db.select().from(aiSessions).where(eq(aiSessions.id, id)).limit(1);
  return row ?? null;
}
