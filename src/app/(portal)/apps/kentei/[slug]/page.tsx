import { ExamPage } from "@/modules/apps/kentei";

export default async function Page(props: PageProps<"/apps/kentei/[slug]">) {
  const { slug } = await props.params;
  return <ExamPage slug={slug} />;
}
