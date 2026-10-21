import { CalendarPage, parseMonth, type ExtraDayItem } from "@/modules/apps/calendar";
import { listTodoCalendarItems } from "@/modules/apps/todo";

// アプリどうしは参照しないので、本人の TODO の期限はここで読み、ただのデータとしてカレンダーに渡す(docs/DESIGN.md 39.4)。
export default async function Page(props: PageProps<"/apps/calendar">) {
  const sp = await props.searchParams;
  const extraDayItems: ExtraDayItem[] = await listTodoCalendarItems();
  return (
    <CalendarPage
      month={parseMonth(typeof sp.month === "string" ? sp.month : undefined)}
      extraDayItems={extraDayItems}
    />
  );
}
