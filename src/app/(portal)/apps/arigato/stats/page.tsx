import { ArigatoStatsPage } from "@/modules/apps/arigato";

export default async function Page(props: PageProps<"/apps/arigato/stats">) {
  const { month } = await props.searchParams;
  return <ArigatoStatsPage month={typeof month === "string" ? month : undefined} />;
}
