import { EmployeeListPage } from "@/modules/core/employees";

export default async function EmployeesPage(props: PageProps<"/admin/employees">) {
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return (
    <EmployeeListPage q={one(sp.q)} status={one(sp.status)} warningOnly={one(sp.warning) === "1"} />
  );
}
