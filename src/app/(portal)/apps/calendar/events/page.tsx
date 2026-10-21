import { CalendarEventsPage } from "@/modules/apps/calendar";

export default async function Page(props: PageProps<"/apps/calendar/events">) {
  const { date } = await props.searchParams;
  return <CalendarEventsPage date={typeof date === "string" ? date : undefined} />;
}
