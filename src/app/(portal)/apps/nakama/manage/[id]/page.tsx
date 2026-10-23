import { NakamaMemberEditPage } from "@/modules/apps/nakama";

export default async function Page(props: PageProps<"/apps/nakama/manage/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  return <NakamaMemberEditPage employeeId={id} added={sp.added === "1"} />;
}
