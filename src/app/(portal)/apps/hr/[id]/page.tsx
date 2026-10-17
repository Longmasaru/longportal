import { HrEmployeePage, parseKind, parseTab } from "@/modules/apps/hr";

export default async function Page(props: PageProps<"/apps/hr/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  return <HrEmployeePage employeeId={id} kind={parseKind(sp.kind)} tab={parseTab(sp.tab)} />;
}
