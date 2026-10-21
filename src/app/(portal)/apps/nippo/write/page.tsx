import { NippoWritePage } from "@/modules/apps/nippo";

export default async function Page(props: PageProps<"/apps/nippo/write">) {
  const sp = await props.searchParams;
  return <NippoWritePage date={typeof sp.date === "string" ? sp.date : undefined} />;
}
