import { AudienceEditPage } from "@/modules/core/audience";

export default async function AudiencePage(props: PageProps<"/admin/audiences/[id]">) {
  const { id } = await props.params;
  return <AudienceEditPage id={id} />;
}
