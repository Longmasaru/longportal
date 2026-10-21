import { MeyasubakoPostPage } from "@/modules/apps/meyasubako";

export default async function Page(props: PageProps<"/apps/meyasubako/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  return <MeyasubakoPostPage postId={id} sent={sp.sent === "1"} />;
}
