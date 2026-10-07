import Link from "next/link";
import { requireGlobalPermission } from "../../access";
import { LINK_CLASS, PageHeading } from "../../shared/ui/form";
import { getFormOptions } from "../queries";
import { EmployeeForm } from "./employee-form";

export async function EmployeeNewPage() {
  await requireGlobalPermission("core.employees.manage");
  const options = await getFormOptions();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="社員を登録"
        description="入社予定者も先に登録できます(状態は「入社予定」のまま、配属も未確定で構いません)。"
        aside={
          <Link href="/admin/employees" className={LINK_CLASS}>
            社員一覧へ戻る
          </Link>
        }
      />
      {options.employmentTypes.length === 0 ? (
        <p className="border-brand01/15 text-brand04 border-y py-8 text-center text-sm">
          先に「組織管理」で雇用区分を登録してください。
        </p>
      ) : (
        <EmployeeForm options={options} />
      )}
    </div>
  );
}
