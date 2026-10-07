import Link from "next/link";
import { requireGlobalPermission } from "../../access";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, PageHeading, StatusTag } from "../../shared/ui/form";
import { AUDIT_ACTION_LABEL, auditActionLabel } from "../labels";
import { AUDIT_PAGE_SIZE, listAuditLogs } from "../queries";

function formatJst(date: Date): string {
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export async function AuditPage({ action, page }: { action?: string; page: number }) {
  await requireGlobalPermission("core.audit.view");
  const { items, total } = await listAuditLogs({ action, page });
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (action) q.set("action", action);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return `/admin/audit-logs${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="監査ログ"
        description="管理・セキュリティ上重要な操作の記録です(誰が・いつ・何を・どう変更したか)。"
      />

      <form method="get" className="border-brand01/20 flex flex-wrap items-end gap-4 border bg-white p-4">
        <div>
          <label htmlFor="action" className="text-brand01 mb-1.5 block text-sm font-bold">
            操作
          </label>
          <select id="action" name="action" defaultValue={action ?? ""} className={FIELD_CLASS}>
            <option value="">すべて</option>
            {Object.entries(AUDIT_ACTION_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={BUTTON_PRIMARY}>
          絞り込み
        </button>
        <Link href="/admin/audit-logs" className={BUTTON_SECONDARY}>
          クリア
        </Link>
      </form>

      <section aria-label="監査ログの一覧">
        <p className="text-brand04 mb-2 text-sm">
          {total}件(新しい順) ・ {page} / {pages} ページ
        </p>
        {items.length === 0 ? (
          <p className="border-brand01/15 text-brand04 border-y py-10 text-center text-sm">
            該当する記録がありません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead>
                <tr className="border-brand01 text-brand01 border-b-2 text-xs">
                  <th className="px-2 py-2 font-bold">日時(JST)</th>
                  <th className="px-2 py-2 font-bold">操作者</th>
                  <th className="px-2 py-2 font-bold">操作</th>
                  <th className="px-2 py-2 font-bold">対象</th>
                  <th className="px-2 py-2 font-bold">内容</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-brand04/40 border-b align-top">
                    <td className="font-heading text-brand04 px-2 py-3 text-xs whitespace-nowrap">
                      {formatJst(r.at)}
                    </td>
                    <td className="text-brand01 px-2 py-3">{r.actorLoginId ?? "(削除済み)"}</td>
                    <td className="px-2 py-3">
                      <StatusTag tone="info">{auditActionLabel(r.action)}</StatusTag>
                    </td>
                    <td className="text-brand04 px-2 py-3 text-xs">
                      {r.targetType}
                      {r.targetId ? <span className="block break-all">{r.targetId}</span> : null}
                    </td>
                    <td className="px-2 py-3">
                      {r.before == null && r.after == null ? (
                        <span className="text-brand04 text-xs">—</span>
                      ) : (
                        <details>
                          <summary className="text-brand01 hover:text-brand03 cursor-pointer text-xs font-bold">
                            変更の詳細
                          </summary>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {r.before != null ? (
                              <div>
                                <p className="text-brand04 text-xs font-bold">変更前</p>
                                <pre className="bg-field text-brand01 max-h-64 overflow-auto p-2 text-xs">
                                  {pretty(r.before)}
                                </pre>
                              </div>
                            ) : null}
                            {r.after != null ? (
                              <div>
                                <p className="text-brand04 text-xs font-bold">変更後</p>
                                <pre className="bg-field text-brand01 max-h-64 overflow-auto p-2 text-xs">
                                  {pretty(r.after)}
                                </pre>
                              </div>
                            ) : null}
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 ? (
          <nav aria-label="ページ" className="mt-4 flex items-center justify-center gap-4 text-sm">
            {page > 1 ? (
              <Link href={href(page - 1)} className="text-brand01 hover:text-brand03 font-bold">
                前のページ
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={href(page + 1)} className="text-brand01 hover:text-brand03 font-bold">
                次のページ
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
