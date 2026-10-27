import { ZukanEntryPage } from "@/modules/apps/zukan";

export default async function Page(props: PageProps<"/apps/zukan/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  return <ZukanEntryPage entryId={id} isNew={sp.new === "1"} />;
}
