"use client";

import { useActionState } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, Field, FormNotice } from "../../shared/ui/form";
import {
  issueAccountAction,
  resetPasswordAction,
  setUserStatusAction,
  type AccountFormState,
} from "../actions";

/** 発行・再設定の結果。一時パスワードはこの画面に 1 度だけ表示され、再表示はできない。 */
function AccountResult({ state }: { state: AccountFormState }) {
  if (!state) return null;
  return (
    <div className="flex flex-col gap-3">
      {state.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {state.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}
      {state.tempPassword ? (
        <div className="border-brand03 bg-brand03/10 border p-4" role="status">
          <p className="text-brand01 text-sm font-bold">
            一時パスワード(この画面を閉じると再表示できません。本人に安全な方法で伝えてください)
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-brand04">ログインID</dt>
            <dd className="text-brand01 font-bold select-all">{state.loginId}</dd>
            <dt className="text-brand04">一時パスワード</dt>
            <dd className="text-brand01 font-heading text-lg font-bold tracking-wider select-all">
              {state.tempPassword}
            </dd>
          </dl>
          <p className="text-brand04 mt-2 text-xs">初回ログイン時に、本人がパスワードを変更します。</p>
        </div>
      ) : null}
    </div>
  );
}

export function IssueAccountForm({
  employeeId,
  defaultLoginId,
  canIssue,
}: {
  employeeId: string;
  defaultLoginId: string;
  canIssue: boolean;
}) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(issueAccountAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="employeeId" value={employeeId} />
      <AccountResult state={state} />
      {!canIssue ? (
        <FormNotice tone="warning">
          アカウントを発行するには、終了していない主所属が必要です。先に所属を設定してください。
        </FormNotice>
      ) : null}
      <div className="max-w-sm">
        <Field
          label="ログインID"
          htmlFor="loginId"
          required
          hint="半角英数字と . _ - で3〜50文字。大文字は小文字として扱われます。"
        >
          <input
            id="loginId"
            name="loginId"
            required
            defaultValue={defaultLoginId}
            autoCapitalize="none"
            spellCheck={false}
            className={FIELD_CLASS}
          />
        </Field>
      </div>
      <div>
        <button type="submit" disabled={pending || !canIssue} className={BUTTON_PRIMARY}>
          {pending ? "発行中…" : "アカウントを発行"}
        </button>
      </div>
    </form>
  );
}

export function AccountControls({
  userId,
  status,
  isSelf,
}: {
  userId: string;
  status: string;
  isSelf: boolean;
}) {
  const [statusState, statusAction, statusPending] = useActionState<AccountFormState, FormData>(
    setUserStatusAction,
    undefined,
  );
  const [resetState, resetAction, resetPending] = useActionState<AccountFormState, FormData>(
    resetPasswordAction,
    undefined,
  );
  const disabling = status === "active";

  return (
    <div className="flex flex-col gap-4">
      <AccountResult state={statusState} />
      <AccountResult state={resetState} />
      <div className="flex flex-wrap gap-3">
        <form
          action={statusAction}
          onSubmit={(e) => {
            if (disabling && !window.confirm("このアカウントを無効にします。よろしいですか?")) e.preventDefault();
          }}
        >
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="status" value={disabling ? "disabled" : "active"} />
          <button type="submit" disabled={statusPending || (disabling && isSelf)} className={BUTTON_SECONDARY}>
            {statusPending ? "処理中…" : disabling ? "アカウントを無効にする" : "アカウントを有効にする"}
          </button>
        </form>
        <form
          action={resetAction}
          onSubmit={(e) => {
            if (!window.confirm("新しい一時パスワードを発行します。現在のパスワードは使えなくなります。よろしいですか?")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="userId" value={userId} />
          <button type="submit" disabled={resetPending || isSelf} className={BUTTON_SECONDARY}>
            {resetPending ? "処理中…" : "パスワードを再設定"}
          </button>
        </form>
      </div>
      {isSelf ? (
        <p className="text-brand04 text-xs">自分自身のアカウントは、無効化・再設定できません。</p>
      ) : null}
    </div>
  );
}
