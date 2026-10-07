import { ComingSoon } from "@/modules/core/portal";

// メニューにある未実装ページの暫定表示(各画面の実装時にこのルートから置き換える)。
export default async function PlaceholderPage(props: PageProps<"/[...slug]">) {
  const { slug } = await props.params;
  return <ComingSoon href={`/${slug.join("/")}`} />;
}
