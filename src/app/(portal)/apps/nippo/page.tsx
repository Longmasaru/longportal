import { isReviewView, NippoPage } from "@/modules/apps/nippo";

export default async function Page(props: PageProps<"/apps/nippo">) {
  const sp = await props.searchParams;
  return (
    <NippoPage
      tab={typeof sp.tab === "string" ? sp.tab : undefined}
      view={isReviewView(sp.view) ? sp.view : "pending"}
      employeeId={typeof sp.employee === "string" && sp.employee ? sp.employee : undefined}
    />
  );
}
