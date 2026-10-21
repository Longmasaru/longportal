import { getArigatoPendingItems } from "@/modules/apps/arigato";
import { CalendarHomeNotice } from "@/modules/apps/calendar";
import { TodoHomeNotice } from "@/modules/apps/todo";
import { PortalHome } from "@/modules/core/portal";

// core は apps を参照できないので、アプリからのお知らせ(会社カレンダー・TODO の依頼)と要対応(ありがとうカード)はここで渡す。
// docs/DESIGN.md 33 章・39.3。
export default async function HomePage() {
  return (
    <>
      <CalendarHomeNotice />
      <TodoHomeNotice />
      <PortalHome appPendingItems={await getArigatoPendingItems()} />
    </>
  );
}
