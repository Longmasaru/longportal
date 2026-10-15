import { CalendarPage, parseMonth } from "@/modules/apps/calendar";

export default async function Page(props: PageProps<"/apps/calendar">) {
  const sp = await props.searchParams;
  return <CalendarPage month={parseMonth(typeof sp.month === "string" ? sp.month : undefined)} />;
}
