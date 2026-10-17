"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { BUTTON_PRIMARY, FIELD_CLASS, Field, FormNotice } from "@/modules/core/shared/ui/form";
import { updateBookAction, type BookFormState } from "../actions";

export type BookFormValues = {
  id: string;
  slug: string;
  department: string;
  title: string;
  description: string;
  sortOrder: number;
  target: string;
  audienceId: string | null;
  isPublished: boolean;
  sourceUrl: string;
};

/** 教科書の設定(公開・見られる人・表示)。入力エラーのときに入力内容が消えないよう、フォームのリセットを起こさない送り方にする。 */
export function BookForm({ book, audiences }: { book: BookFormValues; audiences: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<BookFormState, FormData>(updateBookAction, undefined);
  const [target, setTarget] = useState(book.target);
  const p = `bf-${book.id}`;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={book.id} />
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
        <Field label="まとまり(部署)" htmlFor={`${p}-dept`} required>
          <input
            id={`${p}-dept`}
            name="department"
            required
            maxLength={40}
            defaultValue={book.department}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="題名" htmlFor={`${p}-title`} required>
          <input id={`${p}-title`} name="title" required maxLength={80} defaultValue={book.title} className={FIELD_CLASS} />
        </Field>
        <Field label="並び順" htmlFor={`${p}-sort`}>
          <input
            id={`${p}-sort`}
            name="sortOrder"
            type="number"
            min={0}
            max={9999}
            defaultValue={book.sortOrder}
            className={`${FIELD_CLASS} sm:w-24`}
          />
        </Field>
      </div>

      <Field label="説明" htmlFor={`${p}-desc`}>
        <input id={`${p}-desc`} name="description" maxLength={300} defaultValue={book.description} className={FIELD_CLASS} />
      </Field>

      <Field label="元の Google ドキュメントの URL" htmlFor={`${p}-src`} hint="管理する人にだけ、目次にリンクを出します。">
        <input
          id={`${p}-src`}
          name="sourceUrl"
          type="url"
          maxLength={2000}
          defaultValue={book.sourceUrl}
          className={FIELD_CLASS}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="見られる人" htmlFor={`${p}-target`} required>
          <select
            id={`${p}-target`}
            name="target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="company">全員(このアプリを使える人)</option>
            <option value="audience">Audience で限定する</option>
          </select>
        </Field>
        {target === "audience" ? (
          <Field label="Audience" htmlFor={`${p}-aud`} required hint="Audience は「対象者(Audience)」の管理画面で作ります。">
            <select id={`${p}-aud`} name="audienceId" defaultValue={book.audienceId ?? ""} className={FIELD_CLASS}>
              <option value="">選択してください</option>
              {audiences.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <input type="hidden" name="audienceId" value="" />
        )}
      </div>

      <label className="text-brand01 flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" name="isPublished" defaultChecked={book.isPublished} className="accent-brand01" />
        公開する(外すと、管理する人にしか見えません)
      </label>

      <div>
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "保存中…" : "保存"}
        </button>
      </div>
    </form>
  );
}
