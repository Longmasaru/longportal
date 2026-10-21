import { OrgChartPage } from "@/modules/apps/soshikizu";

export default async function Page(props: PageProps<"/apps/soshikizu">) {
  const sp = await props.searchParams;
  return <OrgChartPage location={typeof sp.location === "string" ? sp.location : null} />;
}
