"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, Field, FormNotice, LABEL_CLASS } from "../../shared/ui/form";
import { saveNoticeAction, type NoticeFormState } from "../actions";
import { NOTICE_KIND_LABEL, NOTICE_PRIORITY_LABEL, NOTICE_TARGET_LABEL } from "../labels";
import {
  NOTICE_KINDS,
  NOTICE_PRIORITIES,
  NOTICE_TARGETS,
  type NoticeKind,
  type NoticePriority,
  type NoticeTarget,
} from "../constants";
import { AttachmentsField, type ExistingAttachment } from "./attachments-field";
import { BodyAssist } from "./body-assist";

const BODY_MAX = 5000;

export type NoticeFormValues = {
  id: string;
  title: string;
  body: string;
  kind: NoticeKind;
  priority: NoticePriority;
  target: NoticeTarget;
  audienceId: string | null;
  requiresAction: boolean;
  publishedOn: string;
  expiresOn: string | null;
  bannerUntil: string | null;
  recipientIds: string[];
  status: "draft" | "published";
};

export type RecipientOption = { id: string; employeeNumber: string; name: string; affiliation: string };

/** お知らせの作成・編集フォーム。「下書き保存」と「公開する」の 2 つのボタンで保存する。 */
export function NoticeForm({
  notice,
  audiences,
  employees,
  today,
  allowIndividual,
  attachments = [],
}: {
  notice?: NoticeFormValues;
  /** 登録済みの添付ファイル(編集のとき)。 */
  attachments?: ExistingAttachment[];
  audiences: { id: string; name: string }[];
  employees: RecipientOption[];
  today: string;
  /** 個人宛てを選べるか(権限 core.notices.individual)。 */
  allowIndividual: boolean;
}) {
  const [state, action, pending] = useActionState<NoticeFormState, FormData>(saveNoticeAction, undefined);
  const [target, setTarget] = useState<NoticeTarget>(notice?.target ?? "company");
  const [priority, setPriority] = useState<NoticePriority>(notice?.priority ?? "normal");
  const [recipients, setRecipients] = useState<Set<string>>(new Set(notice?.recipientIds ?? []));
  const [filter, setFilter] = useState("");
  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [uploading, setUploading] = useState(false);
  const bannerAllowed = target === "company" && priority === "urgent";
  const shown = employees.filter((e) =>
    filter.trim() === "" ? true : `${e.name}${e.employeeNumber}${e.affiliation}`.includes(filter.trim()),
  );

  // form の action に直接渡すと、送信のたびにフォームが初期状態に戻り、入力エラーのときに
  // 書いた本文が消えてしまう。onSubmit で、押したボタン(intent)ごと送り、リセットを起こさない。
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => action(formData));
  };

  return (
    <form onSubmit={submit} className="border-brand01/20 flex flex-col gap-5 border bg-white p-5">
      {notice ? <input type="hidden" name="id" value={notice.id} /> : null}
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}

      <Field label="タイトル" htmlFor="nf-title" required>
        <input
          id="nf-title"
          name="title"
          required
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={FIELD_CLASS}
        />
      </Field>
      <Field label="本文" htmlFor="nf-body" hint="文章と改行が、そのまま表示されます(5000 文字まで)。URL はリンクになります。">
        <textarea
          id="nf-body"
          name="body"
          rows={8}
          maxLength={BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${FIELD_CLASS} leading-relaxed`}
        />
      </Field>
      <BodyAssist title={title} body={body} onChange={setBody} max={BODY_MAX} />

      <AttachmentsField existing={attachments} onBusyChange={setUploading} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="種類" htmlFor="nf-kind" required>
          <select id="nf-kind" name="kind" defaultValue={notice?.kind ?? "general"} className={FIELD_CLASS}>
            {NOTICE_KINDS.map((k) => (
              <option key={k} value={k}>
                {NOTICE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="重要度" htmlFor="nf-priority" required>
          <select
            id="nf-priority"
            name="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as NoticePriority)}
            className={FIELD_CLASS}
          >
            {NOTICE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {NOTICE_PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset>
        <legend className={LABEL_CLASS}>
          宛先<span className="bg-brand03 ml-2 px-1 text-xs font-normal text-white">必須</span>
        </legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {NOTICE_TARGETS.filter((t) => allowIndividual || t !== "individual").map((t) => (
            <label key={t} className="text-brand01 flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="target"
                value={t}
                checked={target === t}
                onChange={() => setTarget(t)}
                className="accent-brand01 size-4"
              />
              {NOTICE_TARGET_LABEL[t]}
            </label>
          ))}
        </div>
        <p className="text-brand04 mt-1 text-xs">
          全社宛はサイドバーの「重要・全社」に、それ以外は対象の人の「個人」に表示されます。
        </p>
      </fieldset>

      {target === "audience" ? (
        <Field label="Audience" htmlFor="nf-audience" required hint="有効な Audience だけを選べます。">
          <select
            id="nf-audience"
            name="audienceId"
            required
            defaultValue={notice?.audienceId ?? ""}
            className={FIELD_CLASS}
          >
            <option value="" disabled>
              選択してください
            </option>
            {audiences.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {target === "individual" ? (
        <div>
          <p className={LABEL_CLASS}>
            宛先の社員<span className="bg-brand03 ml-2 px-1 text-xs font-normal text-white">必須</span>
            <span className="text-brand04 ml-2 font-normal">{recipients.size}名を選択中</span>
          </p>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="氏名・社員番号・所属で絞り込み"
            aria-label="宛先の社員を絞り込み"
            className={`${FIELD_CLASS} mb-2`}
          />
          {[...recipients].map((id) => (
            <input key={id} type="hidden" name="recipientIds" value={id} />
          ))}
          <ul className="border-brand01/20 max-h-72 overflow-y-auto border">
            {shown.map((e) => (
              <li key={e.id} className="border-brand04/30 border-b last:border-b-0">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={recipients.has(e.id)}
                    onChange={(ev) =>
                      setRecipients((s) => {
                        const next = new Set(s);
                        if (ev.target.checked) next.add(e.id);
                        else next.delete(e.id);
                        return next;
                      })
                    }
                    className="accent-brand01 size-4"
                  />
                  <span className="text-brand01 font-bold">{e.name}</span>
                  <span className="font-heading text-brand04 text-xs">{e.employeeNumber}</span>
                  <span className="text-brand04 ml-auto text-xs">{e.affiliation}</span>
                </label>
              </li>
            ))}
            {shown.length === 0 ? <li className="text-brand04 px-3 py-4 text-center text-sm">該当する社員がいません。</li> : null}
          </ul>
        </div>
      ) : null}

      <label className="text-brand01 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="requiresAction"
          defaultChecked={notice?.requiresAction}
          className="accent-brand01 size-4"
        />
        <span>
          <span className="font-bold">確認ボタンを出す(要対応)</span>
          <span className="text-brand04 block text-xs">社員に「確認しました」を押してもらい、確認した人・まだの人を一覧で見られます。</span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="掲載開始日" htmlFor="nf-published" required>
          <input
            id="nf-published"
            name="publishedOn"
            type="date"
            required
            defaultValue={notice?.publishedOn ?? today}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="掲載終了日" htmlFor="nf-expires" hint="この日まで表示します。空なら無期限。">
          <input
            id="nf-expires"
            name="expiresOn"
            type="date"
            defaultValue={notice?.expiresOn ?? ""}
            className={FIELD_CLASS}
          />
        </Field>
        {bannerAllowed ? (
          <Field label="ホームのバナーの最終日" htmlFor="nf-banner" hint="全社宛の緊急のときだけ。この日までホームの上部に出します。">
            <input
              id="nf-banner"
              name="bannerUntil"
              type="date"
              defaultValue={notice?.bannerUntil ?? ""}
              className={FIELD_CLASS}
            />
          </Field>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" name="intent" value="publish" disabled={pending || uploading} className={BUTTON_PRIMARY}>
          {pending ? "保存中…" : notice?.status === "published" ? "公開中のまま保存" : "公開する"}
        </button>
        <button type="submit" name="intent" value="draft" disabled={pending || uploading} className={BUTTON_SECONDARY}>
          下書きとして保存
        </button>
      </div>
      {notice?.status === "published" ? (
        <p className="text-brand04 text-xs">「下書きとして保存」を押すと、社員からは見えなくなります。</p>
      ) : null}
    </form>
  );
}
