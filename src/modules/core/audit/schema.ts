import { index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth/schema";
import { core, idColumn } from "../shared/schema-helpers";

/**
 * 監査ログ。誰が・いつ・何を・どう変更したかを追跡する(docs/DESIGN.md 9 章)。
 * 管理・セキュリティ上重要な操作だけを対象にする。パスワードなどの秘密は before / after に含めない。
 */
export const auditLogs = core.table(
  "audit_logs",
  {
    id: idColumn(),
    /** 操作した user。user が削除されてもログは残す。 */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** 例: employee.update / employee.transfer / user.disable */
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_at_idx").on(t.at),
    index("audit_logs_target_idx").on(t.targetType, t.targetId),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
