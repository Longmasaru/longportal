import { AdminNoticeEditPage } from "@/modules/core/notices";

export default async function EditNoticePage(props: PageProps<"/admin/notices/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  return <AdminNoticeEditPage id={id} saved={typeof sp.saved === "string" ? sp.saved : undefined} />;
}
