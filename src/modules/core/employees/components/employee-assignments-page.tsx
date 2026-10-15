import Link from "next/link";
import { requireGlobalPermission } from "../../access";
import { todayJst } from "../../shared/jst";
import { LINK_CLASS, PageHeading } from "../../shared/ui/form";
import { getFormOptions, listEmployees } from "../queries";
import { AssignmentBoardForm, type AssignmentBoardRow } from "./assignment-board-form";

/** 所属の割り当て(退職者以外の社員の主所属の部署・拠点を、一覧でまとめて変える)。 */
export async function EmployeeAssignmentsPage() {
  await requireGlobalPermission("core.employees.manage");
  const today = todayJst();
  const [items, options] = await Promise.all([listEmployees(today), getFormOptions({})]);

  // 部署はマスタの並び順で並べ、所属未設定の社員は最後にする。
  const departmentOrder = new Map(options.departments.map((d, i) => [d.id, i]));
  const activeLocationIds = new Set(options.locations.map((l) => l.id));
  const orderOf = (id: string | null) =>
    id === null ? Number.MAX_SAFE_INTEGER : (departmentOrder.get(id) ?? Number.MAX_SAFE_INTEGER - 1);
  const rows: AssignmentBoardRow[] = items
    .filter((item) => item.status !== "retired")
    .map((item) => ({
      id: item.id,
      employeeNumber: item.employeeNumber,
      name: item.name,
      departmentId: item.current?.departmentId ?? null,
      departmentName: item.current?.departmentName ?? null,
      locationId: item.current?.locationId ?? null,
      editable:
        item.current !== null &&
        departmentOrder.has(item.current.departmentId) &&
        activeLocationIds.has(item.current.locationId),
    }))
    .sort(
      (a, b) =>
        orderOf(a.departmentId) - orderOf(b.departmentId) ||
        a.employeeNumber.localeCompare(b.employeeNumber),
    );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="所属の割り当て"
        description="各社員の主所属の部署と拠点を、一覧で変更します。部署は選択欄、拠点は丸で選びます。変更した社員だけが保存されます。"
        aside={
          <Link href="/admin/employees" className={LINK_CLASS}>
            社員管理へ戻る
          </Link>
        }
      />
      {options.locations.length === 0 || options.departments.length === 0 ? (
        <p className="border-brand01/15 text-brand04 border-y py-10 text-center text-sm">
          部署または拠点が登録されていません。先に
          <Link href="/admin/organization" className={LINK_CLASS}>
            組織管理
          </Link>
          で登録してください。
        </p>
      ) : (
        <AssignmentBoardForm
          rows={rows}
          departments={options.departments}
          locations={options.locations}
          today={today}
        />
      )}
    </div>
  );
}
