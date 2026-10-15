import { getArigatoPendingItems } from "@/modules/apps/arigato";
import { PortalHome } from "@/modules/core/portal";

export default async function HomePage() {
  return <PortalHome appPendingItems={await getArigatoPendingItems()} />;
}
