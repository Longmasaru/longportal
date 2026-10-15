"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, Field, FormNotice } from "../../shared/ui/form";
import { deleteLinkAction, saveLinkAction, type LinkFormState } from "../actions";

export type LinkFormValues = {
  id: string;
  title: string;
  url: string;
  description: string;
  target: "company" | "audience";
  audienceId: string | null;
  sortOrder: number;
  isActive: boolean;
};

/** 社内リンクの追加・編集フォーム(1 件分)。 */
export function LinkForm({
  link,
  audiences,
  nextSortOrder,
}: {
  link?: LinkFormValues;
  audiences: { id: string; name: string }[];
  nextSortOrder?: number;
}) {
  const [state, action, pending] = useActionState<LinkFormState, FormData>(saveLinkAction, undefined);
  const [delState, remove, delPending] = useActionState<LinkFormState, FormData>(deleteLinkAction, undefined);
  const [target, setTarget] = useState<"company" | "audience">(link?.target ?? "company");
  const prefix = link ? `lf-${link.id}` : "lf-new";
  const shown = delState ?? state;

  // 入力エラーのときに入力内容が消えないよう、フォームのリセットを起こさない送り方にする。
  // 追加のフォームは、追加に成功すると一覧の件数が変わり、ページ側の key で作り直されて空に戻る。
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {link ? <input type="hidden" name="id" value={link.id} /> : null}
      {shown?.error ? <FormNotice tone="error">{shown.error}</FormNotice> : null}
      {shown?.success ? <FormNotice tone="success">{shown.success}</FormNotice> : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <Field label="表示名" htmlFor={`${prefix}-title`} required>
          <input id={`${prefix}-title`} name="title" required maxLength={40} defaultValue={link?.title} className={FIELD_CLASS} />
        </Field>
        <Field label="URL" htmlFor={`${prefix}-url`} required>
          <input
            id={`${prefix}-url`}
            name="url"
            type="url"
            required
            placeholder="https://"
            defaultValue={link?.url}
            className={FIELD_CLASS}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <Field label="説明" htmlFor={`${prefix}-desc`}>
          <input
            id={`${prefix}-desc`}
            name="description"
            maxLength={100}
            defaultValue={link?.description}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="表示する相手" htmlFor={`${prefix}-target`} required>
          <select
            id={`${prefix}-target`}
            name="target"
            value={target}
            onChange={(e) => setTarget(e.target.value as "company" | "audience")}
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
              defaultValue={link?.audienceId ?? ""}
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
            defaultValue={link?.sortOrder ?? nextSortOrder ?? 0}
            className={`${FIELD_CLASS} w-24`}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="text-brand01 flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={link?.isActive ?? true} className="accent-brand01 size-4" />
          有効(サイドバーに表示する)
        </label>
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "保存中…" : link ? "保存" : "追加"}
        </button>
        {link ? (
          <button
            type="button"
            disabled={delPending}
            className={BUTTON_SECONDARY}
            onClick={() => {
              if (!window.confirm(`「${link.title}」を削除します。よろしいですか?`)) return;
              const fd = new FormData();
              fd.set("id", link.id);
              startTransition(() => remove(fd));
            }}
          >
            削除
          </button>
        ) : null}
      </div>
    </form>
  );
}
