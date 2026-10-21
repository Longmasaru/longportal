import { getArigatoPendingItems } from "@/modules/apps/arigato";
import { CalendarHomeNotice, getHomeWeek } from "@/modules/apps/calendar";
import { getNippoPendingItems } from "@/modules/apps/nippo";
import { TodoHomeNotice } from "@/modules/apps/todo";
import { PortalHome } from "@/modules/core/portal";

// core は apps を参照できないので、アプリからのお知らせ・今週の予定(会社カレンダー・TODO の依頼)と要対応(日報・ありがとうカード)は
// ここで渡す。docs/DESIGN.md 33 章・39 章・41.3。
export default async function HomePage() {
  const [nippoItems, arigatoItems, week] = await Promise.all([
    getNippoPendingItems(),
    getArigatoPendingItems(),
    getHomeWeek(),
  ]);
  return (
    <>
      <CalendarHomeNotice />
      <TodoHomeNotice />
      <PortalHome appPendingItems={[...nippoItems, ...arigatoItems]} week={week} />
    </>
  );
}
