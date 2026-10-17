import { HrPage, parseKind } from "@/modules/apps/hr";

export default async function Page(props: PageProps<"/apps/hr">) {
  const sp = await props.searchParams;
  return (
    <HrPage
      q={typeof sp.q === "string" ? sp.q : undefined}
      all={sp.all === "1"}
      kind={parseKind(sp.kind)}
    />
  );
}
