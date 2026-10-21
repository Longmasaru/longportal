import { NippoReportPage } from "@/modules/apps/nippo";

export default async function Page(props: PageProps<"/apps/nippo/[id]">) {
  const { id } = await props.params;
  return <NippoReportPage id={id} />;
}
