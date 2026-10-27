import { NakamaPage } from "@/modules/apps/nakama";

export default async function Page(props: PageProps<"/apps/nakama">) {
  const sp = await props.searchParams;
  return (
    <NakamaPage
      q={typeof sp.q === "string" ? sp.q.slice(0, 50) : ""}
      dept={typeof sp.dept === "string" ? sp.dept : null}
    />
  );
}
