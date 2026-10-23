"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { BUTTON_PRIMARY, FIELD_CLASS, Field, FormNotice } from "@/modules/core/shared/ui/form";
import { createBotAction, updateBotAction, type BotFormState } from "../actions";
import { WEEKDAY_LABELS } from "../kinds";
import { RAIN_AREAS } from "../rain";
import type { RoomCandidate } from "../rooms";
import { RoomCreator } from "./room-creator";

export type BotFormValues = {
  id: string;
  name: string;
  kind: string;
  channelId: string;
  isEnabled: boolean;
  settings: Record<string, unknown>;
};

type KindOption = { value: string; label: string; description: string; defaults: Record<string, unknown> };

function RainFields({ p, s }: { p: string; s: Record<string, unknown> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
      <Field label="地域" htmlFor={`${p}-area`} required>
        <select id={`${p}-area`} name="s.area" defaultValue={String(s.area ?? "170010")} className={FIELD_CLASS}>
          {RAIN_AREAS.map((a) => (
            <option key={a.code} value={a.code}>
              {a.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="しきい値(降水確率)" htmlFor={`${p}-th`} required hint="今日のいちばん高い降水確率がこれ以上なら知らせます。">
        <select id={`${p}-th`} name="s.threshold" defaultValue={String(s.threshold ?? 50)} className={FIELD_CLASS}>
          {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => (
            <option key={v} value={v}>
              {v}% 以上
            </option>
          ))}
        </select>
      </Field>
      <label className="text-brand01 flex items-center gap-2 text-sm font-bold sm:col-span-2">
        <input type="checkbox" name="s.sendWhenDry" defaultChecked={s.sendWhenDry === true} className="accent-brand01" />
        雨が降らない日も送る(毎朝、今日の降水確率を知らせる)
      </label>
    </div>
  );
}

function NoticeFields({ p, s }: { p: string; s: Record<string, unknown> }) {
  const days = Array.isArray(s.weekdays) ? s.weekdays.map(Number) : [1, 2, 3, 4, 5];
  return (
    <div className="flex flex-col gap-3">
      <Field label="送る文" htmlFor={`${p}-text`} required>
        <textarea
          id={`${p}-text`}
          name="s.text"
          required
          maxLength={1000}
          rows={3}
          defaultValue={String(s.text ?? "")}
          className={FIELD_CLASS}
        />
      </Field>
      <fieldset>
        <legend className="text-brand01 mb-1.5 text-sm font-bold">送る曜日</legend>
        <div className="flex flex-wrap gap-3">
          {WEEKDAY_LABELS.map((label, i) => (
            <label key={label} className="text-brand01 flex items-center gap-1 text-sm">
              <input type="checkbox" name="s.weekdays" value={i} defaultChecked={days.includes(i)} className="accent-brand01" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Bot の作成(bot なし)と設定の変更。入力エラーのときに入力内容が消えないよう、フォームのリセットを起こさない送り方にする。 */
export function BotForm({
  bot,
  kinds,
  candidates,
}: {
  bot?: BotFormValues;
  kinds: KindOption[];
  candidates: RoomCandidate[];
}) {
  const [state, action, pending] = useActionState<BotFormState, FormData>(
    bot ? updateBotAction : createBotAction,
    undefined,
  );
  const [kind, setKind] = useState(bot?.kind ?? kinds[0]?.value ?? "rain");
  const [name, setName] = useState(bot?.name ?? "");
  const [channelId, setChannelId] = useState(bot?.channelId ?? "");
  const current = kinds.find((k) => k.value === kind);
  const settings = bot?.settings ?? current?.defaults ?? {};
  const p = `bot-${bot?.id ?? "new"}`;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {bot ? <input type="hidden" name="id" value={bot.id} /> : null}
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="名前" htmlFor={`${p}-name`} required>
          <input
            id={`${p}-name`}
            name="name"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FIELD_CLASS}
          />
        </Field>
        {bot ? (
          <input type="hidden" name="kind" value={bot.kind} />
        ) : (
          <Field label="種類" htmlFor={`${p}-kind`} required hint={current?.description}>
            <select id={`${p}-kind`} name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={FIELD_CLASS}>
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field
        label="送り先のトークルーム(channelId)"
        htmlFor={`${p}-ch`}
        required
        hint="下の「部屋を新しく作る」で作ると、自動で入ります。"
      >
        <input
          id={`${p}-ch`}
          name="channelId"
          required
          maxLength={100}
          pattern="[A-Za-z0-9_\-]+"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className={FIELD_CLASS}
        />
      </Field>
      <RoomCreator p={p} candidates={candidates} defaultTitle={name} onCreated={setChannelId} />

      {kind === "rain" ? <RainFields key={kind} p={p} s={settings} /> : null}
      {kind === "notice" ? <NoticeFields key={kind} p={p} s={settings} /> : null}

      <label className="text-brand01 flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" name="isEnabled" defaultChecked={bot?.isEnabled ?? true} className="accent-brand01" />
        毎朝 6 時ごろに動かす(外すと止まります)
      </label>

      <div>
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "保存中…" : bot ? "保存" : "作る"}
        </button>
      </div>
    </form>
  );
}
