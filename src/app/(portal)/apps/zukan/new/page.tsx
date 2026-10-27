import { ZukanNewPage } from "@/modules/apps/zukan";

export default async function Page(props: PageProps<"/apps/zukan/new">) {
  const sp = await props.searchParams;
  return <ZukanNewPage draftId={typeof sp.draft === "string" ? sp.draft : null} />;
}
