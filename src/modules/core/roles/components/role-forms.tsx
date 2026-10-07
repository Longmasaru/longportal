"use client";

import { useActionState, useRef, useState } from "react";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD_CLASS,
  Field,
  FormNotice,
  StatusTag,
} from "../../shared/ui/form";
import {
  addAssignmentAction,
  createRoleAction,
  deleteRoleAction,
  removeAssignmentAction,
  updateRoleAction,
  type RoleFormState,
} from "../actions";
import type { AssignableUser, PermissionRow, RoleRow, ScopeOptions } from "../queries";

export function RoleCreateForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<RoleFormState, FormData>(
    async (prev, formData) => {
      const result = await createRoleAction(prev, formData);
      if (result?.success) formRef.current?.reset();
      return result;
    },
    undefined,
  );

  return (
    <form ref={formRef} action={action} className="border-brand01/20 flex flex-col gap-4 border bg-white p-5">
      <h2 className="text-brand01 font-bold">ロールを作成</h2>
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="ロール名" htmlFor="rc-name" required>
          <input id="rc-name" name="name" required maxLength={50} className={FIELD_CLASS} />
        </Field>
        <Field label="コード" htmlFor="rc-code" required hint="半角小文字・数字・_。作成後は変更できません。">
          <input
            id="rc-code"
            name="code"
            required
            maxLength={50}
            pattern="[a-z][a-z0-9_]*"
            autoCapitalize="none"
            spellCheck={false}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="説明" htmlFor="rc-desc">
          <input id="rc-desc" name="description" maxLength={200} className={FIELD_CLASS} />
        </Field>
      </div>
      <div>
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "作成中…" : "作成"}
        </button>
      </div>
    </form>
  );
}

const GROUP_LABEL = (appKey: string | null) => (appKey === null ? "共通(ポータルの管理)" : appKey);

export function RoleCard({ role, permissions }: { role: RoleRow; permissions: PermissionRow[] }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<RoleFormState, FormData>(
    async (prev, formData) => {
      const result = await updateRoleAction(prev, formData);
      if (result?.success) setEditing(false);
      return result;
    },
    undefined,
  );
  const [delState, delAction, delPending] = useActionState<RoleFormState, FormData>(
    deleteRoleAction,
    undefined,
  );

  const owned = new Set(role.permissionIds);
  const groups = [...new Set(permissions.map((p) => p.appKey))];

  return (
    <li className="border-brand04/40 border-b first:border-t">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-1 py-4">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-brand01 font-bold">{role.name}</span>
            {role.isProtected ? <StatusTag tone="attention">保護(変更・削除不可)</StatusTag> : null}
            {role.isSystem && !role.isProtected ? <StatusTag tone="neutral">システム</StatusTag> : null}
          </p>
          <p className="text-brand04 text-xs">
            コード <span className="font-heading">{role.code}</span> ・ 権限 {role.permissionIds.length}件 ・ 割当{" "}
            {role.assignmentCount}件
          </p>
          {role.description ? <p className="text-brand04 mt-1 text-sm">{role.description}</p> : null}
        </div>
        {!role.isProtected && !editing ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className={BUTTON_SECONDARY}>
              編集
            </button>
            {!role.isSystem ? (
              <form
                action={delAction}
                onSubmit={(e) => {
                  if (!window.confirm(`ロール「${role.name}」を削除します。よろしいですか?`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={role.id} />
                <button type="submit" disabled={delPending} className={BUTTON_SECONDARY}>
                  削除
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
      {delState?.error ? (
        <div className="px-1 pb-3">
          <FormNotice tone="error">{delState.error}</FormNotice>
        </div>
      ) : null}
      {delState?.success ? (
        <div className="px-1 pb-3">
          <FormNotice tone="success">{delState.success}</FormNotice>
        </div>
      ) : null}

      {role.isProtected ? (
        <p className="text-brand04 px-1 pb-4 text-sm">
          このロールは、すべての権限を常に持ちます(新しい権限は同期で自動的に付与されます)。
        </p>
      ) : null}

      {editing ? (
        <form action={action} className="bg-bg01/50 flex flex-col gap-5 p-4">
          <input type="hidden" name="id" value={role.id} />
          {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ロール名" htmlFor={`rn-${role.id}`} required>
              <input id={`rn-${role.id}`} name="name" required maxLength={50} defaultValue={role.name} className={FIELD_CLASS} />
            </Field>
            <Field label="説明" htmlFor={`rd-${role.id}`}>
              <input id={`rd-${role.id}`} name="description" maxLength={200} defaultValue={role.description} className={FIELD_CLASS} />
            </Field>
          </div>
          <fieldset className="flex flex-col gap-4">
            <legend className="text-brand01 mb-1 text-sm font-bold">権限</legend>
            <p className="text-brand04 text-xs">
              権限の種類はコードで定義されています(ここでは追加できません)。このロールに含める権限を選びます。
            </p>
            {groups.map((appKey) => (
              <div key={appKey ?? "core"}>
                <p className="text-brand04 mb-1 text-xs font-bold tracking-wider">{GROUP_LABEL(appKey)}</p>
                <ul className="flex flex-col gap-1.5">
                  {permissions
                    .filter((p) => p.appKey === appKey)
                    .map((p) => (
                      <li key={p.id}>
                        <label className="text-brand01 flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="permissionIds"
                            value={p.id}
                            defaultChecked={owned.has(p.id)}
                            className="mt-1 size-4"
                          />
                          <span>
                            <span className="font-heading font-bold">{p.code}</span>
                            <span className="text-brand04 block text-xs">{p.description}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </fieldset>
          <div className="flex gap-3">
            <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
              {pending ? "保存中…" : "保存"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className={BUTTON_SECONDARY}>
              キャンセル
            </button>
          </div>
        </form>
      ) : !role.isProtected ? (
        <div className="px-1 pb-4">
          {role.permissionIds.length === 0 ? (
            <p className="text-brand04 text-xs">権限がまだ選ばれていません。「編集」で選んでください。</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {permissions
                .filter((p) => owned.has(p.id))
                .map((p) => (
                  <li key={p.id}>
                    <StatusTag tone="info">{p.code}</StatusTag>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

export function AssignmentForm({
  users,
  roles,
  scope,
}: {
  users: AssignableUser[];
  roles: { id: string; name: string; isProtected: boolean }[];
  scope: ScopeOptions;
}) {
  const [state, action, pending] = useActionState<RoleFormState, FormData>(addAssignmentAction, undefined);

  return (
    <form action={action} className="border-brand01/20 flex flex-col gap-4 border bg-white p-5">
      <h2 className="text-brand01 font-bold">ロールを割り当てる</h2>
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="ユーザー" htmlFor="as-user" required>
          <select id="as-user" name="userId" required defaultValue="" className={FIELD_CLASS}>
            <option value="" disabled>
              選択してください
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.employeeName ? `${u.employeeName}(${u.loginId})` : u.loginId}
                {u.status !== "active" ? " [無効]" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ロール" htmlFor="as-role" required>
          <select id="as-role" name="roleId" required defaultValue="" className={FIELD_CLASS}>
            <option value="" disabled>
              選択してください
            </option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="拠点(スコープ)" htmlFor="as-loc">
          <select id="as-loc" name="locationId" defaultValue="" className={FIELD_CLASS}>
            <option value="">指定しない(全拠点)</option>
            {scope.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="部署(スコープ)" htmlFor="as-dep">
          <select id="as-dep" name="departmentId" defaultValue="" className={FIELD_CLASS}>
            <option value="">指定しない(全部署)</option>
            {scope.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-brand04 text-xs">
        拠点・部署を両方指定しない割当は「全社」です。両方指定すると「拠点かつ部署」の範囲になります。
        管理画面(core.* の権限)は、全社の割当でのみ使えます。
      </p>
      <div>
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "割り当て中…" : "割り当てる"}
        </button>
      </div>
    </form>
  );
}

export function RemoveAssignmentButton({ assignmentId, label }: { assignmentId: string; label: string }) {
  const [state, action, pending] = useActionState<RoleFormState, FormData>(removeAssignmentAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`${label} の割当を解除します。よろしいですか?`)) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <button type="submit" disabled={pending} className={BUTTON_SECONDARY}>
        {pending ? "…" : "解除"}
      </button>
      {state?.error ? <span className="text-brand01 max-w-xs text-right text-xs font-bold">{state.error}</span> : null}
    </form>
  );
}
