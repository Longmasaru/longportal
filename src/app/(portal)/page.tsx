import { getArigatoPendingItems } from "@/modules/apps/arigato";
import { CalendarHomeNotice, getHomeWeek } from "@/modules/apps/calendar";
import { getNippoPendingItems } from "@/modules/apps/nippo";
import { PortalHome } from "@/modules/core/portal";

// core は apps を参照できないので、アプリからのお知らせ・今週の予定(会社カレンダー)と要対応(日報・ありがとうカード)は
// ここで渡す。docs/DESIGN.md 33 章・39 章。
export default async function HomePage() {
  const [nippoItems, arigatoItems, week] = await Promise.all([
    getNippoPendingItems(),
    getArigatoPendingItems(),
    getHomeWeek(),
  ]);
  return (
    <>
      <CalendarHomeNotice />
      <PortalHome appPendingItems={[...nippoItems, ...arigatoItems]} week={week} />
    </>
  );
}
