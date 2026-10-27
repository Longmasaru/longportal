import { ResultsPage } from "@/modules/apps/kentei";

export default async function Page(props: PageProps<"/apps/kentei/[slug]/results">) {
  const { slug } = await props.params;
  return <ResultsPage slug={slug} />;
}
