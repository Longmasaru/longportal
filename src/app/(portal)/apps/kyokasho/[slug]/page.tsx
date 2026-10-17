import { BookPage } from "@/modules/apps/kyokasho";

export default async function Page(props: PageProps<"/apps/kyokasho/[slug]">) {
  const { slug } = await props.params;
  return <BookPage slug={slug} />;
}
