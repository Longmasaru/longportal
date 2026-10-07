import { EmployeeDetailPage } from "@/modules/core/employees";

export default async function EmployeePage(props: PageProps<"/admin/employees/[id]">) {
  const { id } = await props.params;
  return <EmployeeDetailPage id={id} />;
}
