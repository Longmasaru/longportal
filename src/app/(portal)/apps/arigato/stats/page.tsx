import { ArigatoStatsPage } from "@/modules/apps/arigato";

export default async function Page(props: PageProps<"/apps/arigato/stats">) {
  const { month, dept } = await props.searchParams;
  return (
    <ArigatoStatsPage
      month={typeof month === "string" ? month : undefined}
      dept={typeof dept === "string" ? dept : undefined}
    />
  );
}
