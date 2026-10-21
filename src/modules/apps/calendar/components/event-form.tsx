"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, Field, FormNotice, LABEL_CLASS } from "@/modules/core/shared/ui/form";
import { deleteEventAction, saveEventAction } from "../event-actions";
import {
  COMPANY_EVENT_KINDS,
  EVENT_KIND_LABEL,
  EVENT_NOTE_MAX,
  EVENT_TITLE_MAX,
  type CompanyEventKind,
  type EventVisibility,
} from "../constants";
import type { EventFormState, InviteeOption } from "../types";

export type EventFormValues = {
  id: string;
  kind: CompanyEventKind;
  date: string;
  time: string | null;
  title: string;
  note: string;
  visibility: EventVisibility;
  audienceId: string | null;
  inviteeIds: string[];
};

const KIND_HINT: Record<CompanyEventKind, string> = {
  paid_leave_day: "休みとして数えます(連休・残りの出勤日数にも反映)。カレンダーに「有給」の印が付きます。お知らせは出しません。",
  temporary_closure: "休みとして数えます。カレンダーに「臨時休業」の印が付きます。",
  event: "健康診断・棚卸し・大掃除など。休みにはしません。参加の返事をお願いする相手を選べます。",
};

/**
 * 予定・呼びかけの登録・編集フォーム(docs/DESIGN.md 38 章)。
 * canManage = calendar.events.manage を持つ人。持たない人は「名指しの呼びかけ」だけを作れる。
 */
export function EventForm({
  event,
  canManage,
  audiences,
  employees,
  defaultDate,
}: {
  event?: EventFormValues;
  canManage: boolean;
  audiences: { id: string; name: string }[];
  employees: InviteeOption[];
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState<EventFormState, FormData>(saveEventAction, undefined);
  const [kind, setKind] = useState<CompanyEventKind>(event?.kind ?? "event");
  const [visibility, setVisibility] = useState<EventVisibility>(event?.visibility ?? "invitees");
  const [invitees, setInvitees] = useState<Set<string>>(new Set(event?.inviteeIds ?? []));
  const [filter, setFilter] = useState("");
  const isOff = kind !== "event";
  const q = filter.trim();
  const shown = employees.filter((e) => (q === "" ? true : `${e.name}${e.nameKana}${e.employeeNumber}${e.affiliation}`.includes(q)));
  const nameById = new Map(employees.map((e) => [e.id, e.name]));

  // form の action に直接渡すと、入力エラーのときに書いた内容が消えるため、onSubmit で送る(お知らせのフォームと同じ)。
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => action(formData));
  };
  const kinds = canManage ? COMPANY_EVENT_KINDS : (["event"] as const);

  return (
    <form onSubmit={submit} className="border-brand01/20 flex flex-col gap-5 border bg-white p-5">
      {event ? <input type="hidden" name="id" value={event.id} /> : null}
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}

      {canManage ? (
        <fieldset>
          <legend className={LABEL_CLASS}>種類</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {kinds.map((k) => (
              <label key={k} className="text-brand01 flex items-center gap-2 text-sm font-bold">
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="accent-brand01 size-4"
                />
                {EVENT_KIND_LABEL[k]}
              </label>
            ))}
          </div>
          <p className="text-brand04 mt-1 text-xs">{KIND_HINT[kind]}</p>
        </fieldset>
      ) : (
        <input type="hidden" name="kind" value="event" />
      )}

      <div className="grid gap-4 sm:grid-cols-[12rem_10rem]">
        <Field label="日付" htmlFor="ev-date" required>
          <input id="ev-date" type="date" name="date" required defaultValue={event?.date ?? defaultDate} className={FIELD_CLASS} />
        </Field>
        {!isOff ? (
          <Field label="時刻" htmlFor="ev-time" hint="なければ空のまま">
            <input id="ev-time" type="time" name="time" defaultValue={event?.time ?? ""} className={FIELD_CLASS} />
          </Field>
        ) : null}
      </div>

      <Field label="名前" htmlFor="ev-title" required={!isOff} hint={isOff ? `空なら「${EVENT_KIND_LABEL[kind]}」と表示します。` : undefined}>
        <input
          id="ev-title"
          name="title"
          required={!isOff}
          maxLength={EVENT_TITLE_MAX}
          defaultValue={event?.title ?? ""}
          placeholder={isOff ? EVENT_KIND_LABEL[kind] : "例: 健康診断の説明会"}
          className={FIELD_CLASS}
        />
      </Field>

      <Field label="メモ" htmlFor="ev-note" hint="場所・持ち物など(任意)">
        <textarea
          id="ev-note"
          name="note"
          rows={3}
          maxLength={EVENT_NOTE_MAX}
          defaultValue={event?.note ?? ""}
          className={`${FIELD_CLASS} resize-y`}
        />
      </Field>

      {!isOff ? (
        <>
          {canManage ? (
            <fieldset>
              <legend className={LABEL_CLASS}>見せる範囲</legend>
              <div className="flex flex-col gap-2">
                <label className="text-brand01 flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="visibility"
                    value="company"
                    checked={visibility === "company"}
                    onChange={() => setVisibility("company")}
                    className="accent-brand01 mt-0.5 size-4"
                  />
                  <span>
                    <span className="font-bold">全社に表示する</span>
                    <span className="text-brand04 block text-xs">カレンダーを使う全員に見えます(返事のお願いは、下で選んだ相手にだけ)。</span>
                  </span>
                </label>
                <label className="text-brand01 flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="visibility"
                    value="invitees"
                    checked={visibility === "invitees"}
                    onChange={() => setVisibility("invitees")}
                    className="accent-brand01 mt-0.5 size-4"
                  />
                  <span>
                    <span className="font-bold">呼びかけた相手にだけ表示する</span>
                    <span className="text-brand04 block text-xs">自分と、下で選んだ相手にだけ見えます。</span>
                  </span>
                </label>
              </div>
            </fieldset>
          ) : (
            <input type="hidden" name="visibility" value="invitees" />
          )}

          <fieldset className="border-brand01/15 flex flex-col gap-4 border-t pt-5">
            <legend className="text-brand01 pr-3 font-bold">参加の呼びかけ</legend>
            <p className="text-brand04 -mt-2 text-sm">
              選んだ相手のカレンダーとホームに「参加の返事をしてください」と出て、参加・不参加を返事してもらえます。
              {canManage ? "相手を選ばなければ、返事のお願いは出ません。" : ""}
            </p>
            {canManage ? (
              <Field label="部署・拠点など(Audience)" htmlFor="ev-audience" hint="条件に当てはまる人に、見るたびに当てはめます(異動しても自動で変わります)。">
                <select id="ev-audience" name="audienceId" defaultValue={event?.audienceId ?? ""} className={FIELD_CLASS}>
                  <option value="">選ばない</option>
                  {audiences.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <div>
              <p className={LABEL_CLASS}>
                社員を名指しする
                <span className="text-brand04 ml-2 font-normal">{invitees.size}名を選択中</span>
              </p>
              {invitees.size > 0 ? (
                <p className="text-brand01 mb-2 text-sm [overflow-wrap:anywhere]">
                  {[...invitees].map((id) => nameById.get(id) ?? "(在籍していない社員)").join("、")}
                </p>
              ) : null}
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="氏名・フリガナ・社員番号・所属で絞り込み"
                aria-label="呼びかける社員を絞り込み"
                className={`${FIELD_CLASS} mb-2`}
              />
              {[...invitees].map((id) => (
                <input key={id} type="hidden" name="inviteeIds" value={id} />
              ))}
              <ul className="border-brand01/20 max-h-72 overflow-y-auto border">
                {shown.map((e) => (
                  <li key={e.id} className="border-brand04/30 border-b last:border-b-0">
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={invitees.has(e.id)}
                        onChange={(ev) =>
                          setInvitees((s) => {
                            const next = new Set(s);
                            if (ev.target.checked) next.add(e.id);
                            else next.delete(e.id);
                            return next;
                          })
                        }
                        className="accent-brand01 size-4"
                      />
                      <span className="text-brand01 font-bold">{e.name}</span>
                      <span className="text-brand04 ml-auto text-xs">{e.affiliation}</span>
                    </label>
                  </li>
                ))}
                {shown.length === 0 ? <li className="text-brand04 px-3 py-4 text-center text-sm">該当する社員がいません。</li> : null}
              </ul>
            </div>
          </fieldset>
        </>
      ) : null}

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "保存中…" : event ? "保存" : "登録"}
        </button>
      </div>
    </form>
  );
}

/** 予定の削除ボタン */
export function DeleteEventButton({ id, hasResponses }: { id: string; hasResponses: boolean }) {
  const [state, action, pending] = useActionState<EventFormState, FormData>(deleteEventAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const message = hasResponses ? "この予定と、届いている返事を削除しますか?" : "この予定を削除しますか?";
        if (!window.confirm(message)) e.preventDefault();
      }}
      className="flex items-center gap-3"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={BUTTON_SECONDARY}>
        {pending ? "削除中…" : "この予定を削除"}
      </button>
      {state?.error ? (
        <span role="alert" className="text-brand03 text-sm font-bold">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
