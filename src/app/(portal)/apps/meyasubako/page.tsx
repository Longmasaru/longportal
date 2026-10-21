import { MeyasubakoPage, parseInboxFilter, parseTab } from "@/modules/apps/meyasubako";

export default async function Page(props: PageProps<"/apps/meyasubako">) {
  const sp = await props.searchParams;
  return <MeyasubakoPage tab={parseTab(sp.tab)} show={parseInboxFilter(sp.show)} />;
}
