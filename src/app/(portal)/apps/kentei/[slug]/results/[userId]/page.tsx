import { LearnerPage } from "@/modules/apps/kentei";

export default async function Page(props: PageProps<"/apps/kentei/[slug]/results/[userId]">) {
  const { slug, userId } = await props.params;
  return <LearnerPage slug={slug} userId={userId} />;
}
