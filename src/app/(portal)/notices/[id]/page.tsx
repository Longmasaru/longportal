import { NoticeDetailPage } from "@/modules/core/notices";

export default async function NoticePage(props: PageProps<"/notices/[id]">) {
  const { id } = await props.params;
  return <NoticeDetailPage id={id} />;
}
