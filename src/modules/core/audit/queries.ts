import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "../auth/schema";
import { auditLogs } from "./schema";

export const AUDIT_PAGE_SIZE = 50;

export type AuditLogItem = {
  id: string;
  at: Date;
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  actorLoginId: string | null;
};

export async function listAuditLogs(options: {
  action?: string;
  page: number;
}): Promise<{ items: AuditLogItem[]; total: number }> {
  const where = options.action ? eq(auditLogs.action, options.action) : undefined;
  const [items, [{ n }]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        at: auditLogs.at,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        before: auditLogs.before,
        after: auditLogs.after,
        actorLoginId: users.loginId,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.at))
      .limit(AUDIT_PAGE_SIZE)
      .offset((options.page - 1) * AUDIT_PAGE_SIZE),
    db.select({ n: count() }).from(auditLogs).where(where),
  ]);
  return { items, total: Number(n) };
}
