import { ZukanPage, parseChapter, parseView } from "@/modules/apps/zukan";

export default async function Page(props: PageProps<"/apps/zukan">) {
  const sp = await props.searchParams;
  return <ZukanPage view={parseView(sp.view)} chapter={parseChapter(sp.ch)} />;
}
