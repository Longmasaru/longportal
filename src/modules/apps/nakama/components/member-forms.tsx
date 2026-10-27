"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, Field, FormNotice } from "@/modules/core/shared/ui/form";
import { addMemberAction, removeMemberAction, updateMemberAction } from "../actions";
import {
  HOMETOWN_MAX,
  NATIVE_NAME_MAX,
  NICKNAME_MAX,
  NOTE_MAX,
  RESIDENCE_STATUSES,
  RESIDENCE_STATUS_LABEL,
  type ResidenceStatus,
} from "../constants";
import type { NakamaFormState } from "../types";

/** 名簿に人を足す(在籍者で、まだ載っていない人から選ぶ)。 */
export function AddMemberForm({ options }: { options: { employeeId: string; label: string }[] }) {
  const [state, action, pending] = useActionState<NakamaFormState, FormData>(addMemberAction, undefined);
  if (options.length === 0) return <p className="text-brand04 text-sm">足せる人はいません(在籍者は全員載っています)。</p>;
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <Field label="載せる人" htmlFor="nakama-add" required>
            <select id="nakama-add" name="employeeId" required defaultValue="" className={FIELD_CLASS}>
              <option value="" disabled>
                選んでください
              </option>
              {options.map((o) => (
                <option key={o.employeeId} value={o.employeeId}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          名簿に足す
        </button>
      </div>
    </form>
  );
}

export type MemberFormValues = {
  employeeId: string;
  nickname: string;
  nativeName: string;
  arrivedOn: string | null;
  hometown: string;
  note: string;
  residenceStatus: ResidenceStatus | null;
  residenceExpiresOn: string | null;
};

/** 名簿の 1 人の内容。入力エラーのときに入力内容が消えないよう、フォームのリセットを起こさない送り方にする。 */
export function MemberForm({ member, today }: { member: MemberFormValues; today: string }) {
  const [state, action, pending] = useActionState<NakamaFormState, FormData>(updateMemberAction, undefined);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };
  const p = `nakama-${member.employeeId}`;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="employeeId" value={member.employeeId} />
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="呼び名" htmlFor={`${p}-nick`} hint="職場で呼んでいる名前(例: アン)。札にいちばん大きく出ます。空なら氏名を出します。">
          <input id={`${p}-nick`} name="nickname" maxLength={NICKNAME_MAX} defaultValue={member.nickname} className={FIELD_CLASS} />
        </Field>
        <Field label="ベトナム語の名前" htmlFor={`${p}-native`} hint="例: Nguyễn Văn An">
          <input
            id={`${p}-native`}
            name="nativeName"
            maxLength={NATIVE_NAME_MAX}
            defaultValue={member.nativeName}
            lang="vi"
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="日本に来た日" htmlFor={`${p}-arrived`} hint="「日本に来て ○年目」を、この日から毎日自動で数えます。">
          <input
            id={`${p}-arrived`}
            name="arrivedOn"
            type="date"
            max={today}
            defaultValue={member.arrivedOn ?? ""}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="在留資格" htmlFor={`${p}-status`} hint="札と印刷に出ます。資格が変わったときだけ直してください。">
          <select id={`${p}-status`} name="residenceStatus" defaultValue={member.residenceStatus ?? ""} className={FIELD_CLASS}>
            <option value="">(入れない)</option>
            {RESIDENCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {RESIDENCE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="出身" htmlFor={`${p}-home`} hint="例: ハノイ">
          <input id={`${p}-home`} name="hometown" maxLength={HOMETOWN_MAX} defaultValue={member.hometown} className={FIELD_CLASS} />
        </Field>
        <Field label="ひとこと" htmlFor={`${p}-note`} hint="趣味・好きなものなど(例: サッカーが好き)">
          <input id={`${p}-note`} name="note" maxLength={NOTE_MAX} defaultValue={member.note} className={FIELD_CLASS} />
        </Field>
        <Field
          label="在留期限(管理用)"
          htmlFor={`${p}-expires`}
          hint="札と印刷には出ません。入れておくと、この管理の画面で期限が近い人を知らせます。"
        >
          <input
            id={`${p}-expires`}
            name="residenceExpiresOn"
            type="date"
            defaultValue={member.residenceExpiresOn ?? ""}
            className={FIELD_CLASS}
          />
        </Field>
      </div>

      <div>
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          保存する
        </button>
      </div>
    </form>
  );
}

/** 名簿から外す(確かめてから)。 */
export function RemoveMemberForm({ employeeId, name }: { employeeId: string; name: string }) {
  return (
    <form
      action={removeMemberAction}
      onSubmit={(e) => {
        if (!window.confirm(`${name} さんを名簿から外しますか?(入力した呼び名なども消えます)`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="employeeId" value={employeeId} />
      <button type="submit" className={BUTTON_SECONDARY}>
        名簿から外す
      </button>
    </form>
  );
}
