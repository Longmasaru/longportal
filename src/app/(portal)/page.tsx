import { getArigatoPendingItems } from "@/modules/apps/arigato";
import { CalendarHomeNotice } from "@/modules/apps/calendar";
import { PortalHome } from "@/modules/core/portal";

// core は apps を参照できないので、アプリからのお知らせ(会社カレンダー)と要対応(ありがとうカード)はここで渡す。docs/DESIGN.md 33 章。
export default async function HomePage() {
  return (
    <>
      <CalendarHomeNotice />
      <PortalHome appPendingItems={await getArigatoPendingItems()} />
    </>
  );
}
