import { CalendarEventPage } from "@/modules/apps/calendar";

export default async function Page(props: PageProps<"/apps/calendar/events/[id]">) {
  const { id } = await props.params;
  return <CalendarEventPage id={id} />;
}
