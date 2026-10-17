import { ChapterPage } from "@/modules/apps/kyokasho";

export default async function Page(props: PageProps<"/apps/kyokasho/[slug]/[chapter]">) {
  const { slug, chapter } = await props.params;
  return <ChapterPage slug={slug} chapter={chapter} />;
}
