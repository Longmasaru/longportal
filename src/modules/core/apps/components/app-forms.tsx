"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, Field, FormNotice } from "../../shared/ui/form";
import {
  createExternalAppAction,
  deleteExternalAppAction,
  updateAppAction,
  type AppFormState,
} from "../actions";
import { APP_ICONS, APP_ICON_LABEL, type AppIcon, type AppKind, type AppTarget } from "../constants";

export type AppFormValues = {
  appKey: string;
  kind: AppKind;
  displayName: string;
  description: string;
  icon: AppIcon;
  url: string | null;
  target: AppTarget;
  audienceId: string | null;
  sortOrder: number;
  isEnabled: boolean;
  inManifest: boolean;
};

/**
 * アプリの設定フォーム。app を渡すと編集、渡さないと別プロジェクトのアプリの新規登録。
 * 入力エラーのときに入力内容が消えないよう、フォームのリセットを起こさない送り方にする。
 */
export function AppForm({
  app,
  audiences,
  nextSortOrder,
}: {
  app?: AppFormValues;
  audiences: { id: string; name: string }[];
  nextSortOrder?: number;
}) {
  const [state, action, pending] = useActionState<AppFormState, FormData>(
    app ? updateAppAction : createExternalAppAction,
    undefined,
  );
  const [delState, remove, delPending] = useActionState<AppFormState, FormData>(deleteExternalAppAction, undefined);
  const [target, setTarget] = useState<AppTarget>(app?.target ?? "company");
  const isExternal = !app || app.kind === "external";
  const prefix = app ? `af-${app.appKey}` : "af-new";
  const shown = delState ?? state;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {app ? <input type="hidden" name="appKey" value={app.appKey} /> : null}
      {shown?.error ? <FormNotice tone="error">{shown.error}</FormNotice> : null}
      {shown?.success ? <FormNotice tone="success">{shown.success}</FormNotice> : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        {app ? null : (
          <Field
            label="アプリの ID"
            htmlFor={`${prefix}-key`}
            required
            hint="半角の小文字・数字・_ -(例: kaizen)。あとから変えられません。"
          >
            <input id={`${prefix}-key`} name="appKey" required maxLength={40} className={FIELD_CLASS} />
          </Field>
        )}
        <Field label="表示名" htmlFor={`${prefix}-name`} required>
          <input
            id={`${prefix}-name`}
            name="displayName"
            required
            maxLength={40}
            defaultValue={app?.displayName}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="アイコン" htmlFor={`${prefix}-icon`} required>
          <select id={`${prefix}-icon`} name="icon" defaultValue={app?.icon ?? "grid"} className={FIELD_CLASS}>
            {APP_ICONS.map((i) => (
              <option key={i} value={i}>
                {APP_ICON_LABEL[i]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {isExternal ? (
        <Field label="URL" htmlFor={`${prefix}-url`} required hint="別タブで開きます。">
          <input
            id={`${prefix}-url`}
            name="url"
            type="url"
            required
            placeholder="https://"
            defaultValue={app?.url ?? ""}
            className={FIELD_CLASS}
          />
        </Field>
      ) : null}

      <Field label="説明" htmlFor={`${prefix}-desc`}>
        <input
          id={`${prefix}-desc`}
          name="description"
          maxLength={200}
          defaultValue={app?.description}
          className={FIELD_CLASS}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="表示する相手" htmlFor={`${prefix}-target`} required>
          <select
            id={`${prefix}-target`}
            name="target"
            value={target}
            onChange={(e) => setTarget(e.target.value as AppTarget)}
            className={FIELD_CLASS}
          >
            <option value="company">全社</option>
            <option value="audience">Audience</option>
          </select>
        </Field>
        {target === "audience" ? (
          <Field label="Audience" htmlFor={`${prefix}-aud`} required>
            <select
              id={`${prefix}-aud`}
              name="audienceId"
              required
              defaultValue={app?.audienceId ?? ""}
              className={FIELD_CLASS}
            >
              <option value="" disabled>
                選択
              </option>
              {audiences.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div />
        )}
        <Field label="並び順" htmlFor={`${prefix}-sort`} hint="小さい順">
          <input
            id={`${prefix}-sort`}
            name="sortOrder"
            type="number"
            min={0}
            max={9999}
            defaultValue={app?.sortOrder ?? nextSortOrder ?? 0}
            className={`${FIELD_CLASS} w-24`}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="text-brand01 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isEnabled"
            defaultChecked={app?.isEnabled ?? false}
            disabled={app?.kind === "internal" && !app.inManifest}
            className="accent-brand01 size-4"
          />
          有効(表示する相手のサイドバーに出す)
        </label>
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "保存中…" : app ? "保存" : "登録"}
        </button>
        {app?.kind === "external" ? (
          <button
            type="button"
            disabled={delPending}
            className={BUTTON_SECONDARY}
            onClick={() => {
              if (!window.confirm(`「${app.displayName}」の登録を削除します。よろしいですか?`)) return;
              const fd = new FormData();
              fd.set("appKey", app.appKey);
              startTransition(() => remove(fd));
            }}
          >
            登録を削除
          </button>
        ) : null}
      </div>
    </form>
  );
}
