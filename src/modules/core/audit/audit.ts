import type { db } from "@/db/client";
import { auditLogs } from "./schema";

/** db 本体とトランザクションのどちらも受け取れる(変更と同じトランザクションで記録するため)。 */
type Executor = Pick<typeof db, "insert">;

export type AuditEntry = {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
};

/** 監査ログを 1 件記録する。変更と同じトランザクション内で呼ぶこと。 */
export async function writeAuditLog(executor: Executor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLogs).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
