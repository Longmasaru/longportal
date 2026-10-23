import { GuidePage } from "@/modules/apps/tejunsho";

export default async function Page(props: PageProps<"/apps/tejunsho/[slug]">) {
  const { slug } = await props.params;
  return <GuidePage slug={slug} />;
}
