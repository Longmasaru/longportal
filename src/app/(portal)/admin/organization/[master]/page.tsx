import { notFound } from "next/navigation";
import { MasterPage, isMasterKey } from "@/modules/core/masters";

export default async function OrganizationMasterPage(props: PageProps<"/admin/organization/[master]">) {
  const { master } = await props.params;
  if (!isMasterKey(master)) notFound();
  return <MasterPage masterKey={master} />;
}
