import { CalendarHomeNotice } from "@/modules/apps/calendar";
import { PortalHome } from "@/modules/core/portal";

// core は apps を参照できないので、アプリからのお知らせ(会社カレンダー)はここで並べる。docs/DESIGN.md 33 章。
export default function HomePage() {
  return (
    <>
      <CalendarHomeNotice />
      <PortalHome />
    </>
  );
}
