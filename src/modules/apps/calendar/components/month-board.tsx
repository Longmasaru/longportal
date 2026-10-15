"use client";

import { useActionState, useState } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, LABEL_CLASS } from "@/modules/core/shared/ui/form";
import { createEntryAction, deleteEntryAction, updateEntryAction } from "../actions";
import { WEEKDAY_LABELS, shortDate, type CalendarDay } from "../logic";
import type { CalendarEntry, EntryFormState } from "../types";

type Props = {
  weeks: (CalendarDay | null)[][];
  entries: CalendarEntry[];
  today: string;
  initialDate: string;
};

function dateTone(day: CalendarDay): string {
  if (day.kind === "off") return "text-brand03";
  if (day.kind === "unknown" && (day.weekday === 0 || day.weekday === 6)) return "text-brand04";
  return "text-brand01";
}

/** 月の表と、選んだ日のメモ・予定。 */
export function MonthBoard({ weeks, entries, today, initialDate }: Props) {
  const [selected, setSelected] = useState(initialDate);
  const byDate = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const selectedDay = weeks.flat().find((d) => d?.date === selected) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <table className="w-full table-fixed border-collapse bg-white">
        <thead>
          <tr>
            {WEEKDAY_LABELS.map((w, i) => (
              <th
                key={w}
                scope="col"
                className={`bg-field py-1.5 text-xs font-bold ${i === 0 ? "text-brand03" : i === 6 ? "text-link" : "text-brand04"}`}
              >
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => {
                if (!day) return <td key={di} className="border-brand01/10 border" />;
                const items = byDate.get(day.date) ?? [];
                const isSelected = day.date === selected;
                const isToday = day.date === today;
                return (
                  <td key={di} className="border-brand01/10 h-16 border p-0 align-top md:h-24">
                    <button
                      type="button"
                      onClick={() => setSelected(day.date)}
                      aria-pressed={isSelected}
                      aria-label={`${shortDate(day.date)} ${day.kind === "off" ? "休み" : day.kind === "work" ? "出勤日" : ""} ${day.label ?? ""} 予定${items.length}件`}
                      className={`hover:bg-bg01 flex h-full w-full flex-col items-stretch gap-0.5 p-1 text-left transition-colors md:p-1.5 ${
                        isSelected ? "outline-brand01 outline-2 -outline-offset-2" : ""
                      } ${day.kind === "off" ? "bg-brand03/5" : ""}`}
                    >
                      <span className="flex flex-wrap items-center gap-x-1">
                        <span
                          className={`text-sm font-bold tabular-nums ${dateTone(day)} ${
                            isToday ? "bg-brand01 inline-flex size-6 items-center justify-center rounded-full !text-white" : ""
                          }`}
                        >
                          {Number(day.date.slice(8))}
                        </span>
                        {day.isWorkSaturday ? (
                          <span className="border-brand01 text-brand01 border px-0.5 text-[0.625rem] leading-tight font-bold whitespace-nowrap">
                            出勤
                          </span>
                        ) : null}
                      </span>
                      {day.label ? (
                        <span className="text-brand04 hidden truncate text-[0.6875rem] leading-tight md:block">
                          {day.label}
                        </span>
                      ) : null}
                      {items.length > 0 ? (
                        <>
                          <span className="flex gap-0.5 md:hidden" aria-hidden>
                            {items.slice(0, 3).map((e) => (
                              <span key={e.id} className="bg-link size-1.5 rounded-full" />
                            ))}
                          </span>
                          <span className="hidden flex-col gap-0.5 md:flex">
                            {items.slice(0, 2).map((e) => (
                              <span key={e.id} className="bg-bg01 text-brand01 truncate px-1 text-[0.6875rem] leading-snug">
                                {e.time ? `${e.time} ` : ""}
                                {e.title}
                              </span>
                            ))}
                            {items.length > 2 ? (
                              <span className="text-brand04 text-[0.6875rem] leading-tight">ほか{items.length - 2}件</span>
                            ) : null}
                          </span>
                        </>
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {selectedDay ? (
        <DayPanel key={selectedDay.date} day={selectedDay} items={byDate.get(selectedDay.date) ?? []} />
      ) : null}
    </div>
  );
}

function DayPanel({ day, items }: { day: CalendarDay; items: CalendarEntry[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <aside className="border-brand01/15 flex flex-col gap-4 self-start border bg-white p-4" aria-live="polite">
      <div>
        <p className="text-brand01 text-lg font-bold">{shortDate(day.date)}</p>
        <p className={`text-sm font-bold ${day.kind === "off" ? "text-brand03" : "text-brand04"}`}>
          {day.kind === "off" ? "休み" : day.kind === "work" ? "出勤日" : "会社カレンダー未登録"}
          {day.label ? ` ・ ${day.label}` : ""}
        </p>
      </div>

      {items.length > 0 ? (
        <ul className="border-brand01/15 flex flex-col border-t">
          {items.map((e) =>
            editingId === e.id ? (
              <li key={e.id} className="border-brand01/15 border-b py-3">
                <EntryForm entry={e} date={day.date} onDone={() => setEditingId(null)} />
              </li>
            ) : (
              <li key={e.id} className="border-brand01/15 flex flex-col gap-1 border-b py-3">
                <p className="text-brand01 font-bold [overflow-wrap:anywhere]">
                  {e.time ? <span className="text-brand03 mr-2 tabular-nums">{e.time}</span> : null}
                  {e.title}
                </p>
                {e.note ? <p className="text-brand04 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{e.note}</p> : null}
                <div className="flex gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => setEditingId(e.id)}
                    className="text-brand01 hover:text-brand03 font-bold transition-colors"
                  >
                    編集
                  </button>
                  <DeleteButton id={e.id} />
                </div>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="text-brand04 text-sm">メモ・予定はまだありません。</p>
      )}

      {editingId === null ? (
        <div className="flex flex-col gap-2">
          <p className="text-brand01 text-sm font-bold">メモ・予定を追加</p>
          <EntryForm date={day.date} />
        </div>
      ) : null}
      <p className="text-brand04 text-xs">書き込んだ内容は、自分にしか見えません。</p>
    </aside>
  );
}

function EntryForm({ entry, date, onDone }: { entry?: CalendarEntry; date: string; onDone?: () => void }) {
  const [values, setValues] = useState({
    date: entry?.date ?? date,
    time: entry?.time ?? "",
    title: entry?.title ?? "",
    note: entry?.note ?? "",
  });
  const [state, action, pending] = useActionState<EntryFormState, FormData>(async (prev, formData) => {
    const result = await (entry ? updateEntryAction : createEntryAction)(prev, formData);
    if (result?.ok) {
      if (entry) onDone?.();
      else setValues({ date, time: "", title: "", note: "" });
    }
    return result;
  }, undefined);
  const idPrefix = entry ? `entry-${entry.id}` : `entry-new-${date}`;
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <form action={action} className="flex flex-col gap-3">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      {entry ? (
        <div>
          <label htmlFor={`${idPrefix}-date`} className={LABEL_CLASS}>
            日付
          </label>
          <input id={`${idPrefix}-date`} type="date" name="date" required value={values.date} onChange={set("date")} className={FIELD_CLASS} />
        </div>
      ) : (
        <input type="hidden" name="date" value={date} />
      )}
      <div>
        <label htmlFor={`${idPrefix}-title`} className={LABEL_CLASS}>
          内容
        </label>
        <input
          id={`${idPrefix}-title`}
          name="title"
          required
          maxLength={100}
          value={values.title}
          onChange={set("title")}
          placeholder="例: 健康診断、〇〇さんに電話"
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-time`} className={LABEL_CLASS}>
          時刻<span className="text-brand04 ml-2 text-xs font-normal">(なければ空のまま)</span>
        </label>
        <input id={`${idPrefix}-time`} type="time" name="time" value={values.time} onChange={set("time")} className={FIELD_CLASS} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-note`} className={LABEL_CLASS}>
          メモ
        </label>
        <textarea
          id={`${idPrefix}-note`}
          name="note"
          rows={2}
          maxLength={1000}
          value={values.note}
          onChange={set("note")}
          className={`${FIELD_CLASS} resize-y`}
        />
      </div>
      {state?.error ? (
        <p role="alert" className="text-brand03 text-sm font-bold">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "保存中…" : entry ? "保存" : "追加"}
        </button>
        {entry ? (
          <button type="button" onClick={onDone} className={BUTTON_SECONDARY}>
            やめる
          </button>
        ) : null}
      </div>
    </form>
  );
}

function DeleteButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<EntryFormState, FormData>(deleteEntryAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("このメモ・予定を削除しますか?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="text-brand04 hover:text-brand03 font-bold transition-colors">
        {pending ? "削除中…" : "削除"}
      </button>
      {state?.error ? <span className="text-brand03 ml-2 text-xs">{state.error}</span> : null}
    </form>
  );
}
