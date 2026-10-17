import { TsukkomiManagePage } from "@/modules/apps/kyokasho";

export default async function Page(props: PageProps<"/apps/kyokasho/manage/tsukkomi">) {
  const { status } = await props.searchParams;
  return <TsukkomiManagePage status={typeof status === "string" ? status : undefined} />;
}
