import { getMeyasubakoNavBadge } from "@/modules/apps/meyasubako";
import { PortalShell } from "@/modules/core/portal";

// サイドバーのアプリの横に出す数は、各アプリが数えてここで渡す(core は apps を参照できない。docs/DESIGN.md 42 章)。
export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const meyasubako = await getMeyasubakoNavBadge();
  return <PortalShell appBadges={{ meyasubako }}>{children}</PortalShell>;
}
