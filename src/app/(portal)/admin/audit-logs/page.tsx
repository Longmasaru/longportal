import { AuditPage } from "@/modules/core/audit";

export default async function AuditLogsPage(props: PageProps<"/admin/audit-logs">) {
  const sp = await props.searchParams;
  const action = typeof sp.action === "string" && sp.action !== "" ? sp.action : undefined;
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  return <AuditPage action={action} page={page} />;
}
