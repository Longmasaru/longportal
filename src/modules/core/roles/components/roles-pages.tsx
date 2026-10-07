import Link from "next/link";
import { requireGlobalPermission } from "../../access";
import { PageHeading, StatusTag } from "../../shared/ui/form";
import {
  listAssignableUsers,
  listAssignments,
  listPermissions,
  listRoles,
  listScopeOptions,
  type AssignmentListItem,
} from "../queries";
import { AssignmentForm, RemoveAssignmentButton, RoleCard, RoleCreateForm } from "./role-forms";

const TABS = [
  { href: "/admin/roles", label: "ロール" },
  { href: "/admin/roles/assignments", label: "ロールの割当" },
] as const;

function Tabs({ current }: { current: string }) {
  return (
    <nav aria-label="権限管理" className="border-brand01/20 flex gap-x-1 border-b">
      {TABS.map((t) => {
        const active = t.href === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
              active
                ? "border-brand03 text-brand01 font-bold"
                : "text-brand04 hover:text-brand03 border-transparent font-medium"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export async function RolesPage() {
  await requireGlobalPermission("core.roles.manage");
  const [roles, permissions] = await Promise.all([listRoles(), listPermissions()]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="権限管理"
        description="ロール(何ができるか)と、その権限を管理します。権限の種類はコードで定義され、ここでは追加できません。"
      />
      <Tabs current="/admin/roles" />
      <RoleCreateForm />
      <section aria-label="ロールの一覧">
        <p className="text-brand04 mb-2 text-sm">{roles.length}件</p>
        <ul>
          {roles.map((role) => (
            <RoleCard key={role.id} role={role} permissions={permissions} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function scopeLabel(a: AssignmentListItem): string {
  if (a.locationName && a.departmentName) return `${a.locationName} かつ ${a.departmentName}`;
  if (a.locationName) return `拠点: ${a.locationName}`;
  if (a.departmentName) return `部署: ${a.departmentName}`;
  return "全社";
}

export async function AssignmentsPage() {
  await requireGlobalPermission("core.roles.manage");
  const [assignments, roles, users, scope] = await Promise.all([
    listAssignments(),
    listRoles(),
    listAssignableUsers(),
    listScopeOptions(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="権限管理"
        description="ユーザーにロールを割り当てます。ロールは「何ができるか」、スコープは「どの範囲でできるか」です。"
      />
      <Tabs current="/admin/roles/assignments" />
      <AssignmentForm
        users={users}
        roles={roles.map((r) => ({ id: r.id, name: r.name, isProtected: r.isProtected }))}
        scope={scope}
      />
      <section aria-label="ロール割当の一覧">
        <p className="text-brand04 mb-2 text-sm">{assignments.length}件</p>
        {assignments.length === 0 ? (
          <p className="border-brand01/15 text-brand04 border-y py-8 text-center text-sm">
            ロールの割当がまだありません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-brand01 text-brand01 border-b-2 text-xs">
                  <th className="px-2 py-2 font-bold">ユーザー</th>
                  <th className="px-2 py-2 font-bold">ロール</th>
                  <th className="px-2 py-2 font-bold">スコープ</th>
                  <th className="px-2 py-2 font-bold" />
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-brand04/40 border-b align-top">
                    <td className="px-2 py-3">
                      <span className="text-brand01 font-bold">{a.employeeName ?? a.loginId}</span>
                      <span className="text-brand04 block text-xs">
                        {a.loginId}
                        {a.userStatus !== "active" ? " ・ 無効" : ""}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <span className="text-brand01">{a.roleName}</span>
                      {a.roleCode === "system_admin" ? (
                        <span className="ml-2">
                          <StatusTag tone="attention">保護</StatusTag>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-3 text-brand01">{scopeLabel(a)}</td>
                    <td className="px-2 py-3 text-right">
                      <RemoveAssignmentButton
                        assignmentId={a.id}
                        label={`${a.employeeName ?? a.loginId} の ${a.roleName}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
