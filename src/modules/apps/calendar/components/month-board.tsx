"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, LABEL_CLASS } from "@/modules/core/shared/ui/form";
import { createEntryAction, deleteEntryAction, updateEntryAction } from "../actions";
import { WEEKDAY_LABELS, shortDate, type CalendarDay } from "../logic";
import { EVENT_KIND_LABEL, EVENT_RESPONSE_LABEL, OFF_EVENT_MARK } from "../constants";
import type { CalendarEntry, EntryFormState, ExtraDayItem, ViewerEvent } from "../types";
import { RespondButtons } from "./respond-buttons";

type Props = {
  weeks: (CalendarDay | null)[][];
  entries: CalendarEntry[];
  /** 全社の予定・呼びかけ(見える条件を通ったもの) */
  events: ViewerEvent[];
  /** ほかのアプリの本人の項目(TODO の期限など。docs/DESIGN.md 39.4) */
  extras: ExtraDayItem[];
  /** 日付ごとの印(給料日・入社記念日・誕生日など) */
  marks: Record<string, string[]>;
  today: string;
  initialDate: string;
};

function dateTone(day: CalendarDay): string {
  if (day.kind === "off") return "text-brand03";
  if (day.kind === "unknown" && (day.weekday === 0 || day.weekday === 6)) return "text-brand04";
  return "text-brand01";
}

/** 月の表と、選んだ日のメモ・予定。 */
export function MonthBoard({ weeks, entries, events, extras, marks, today, initialDate }: Props) {
  const [selected, setSelected] = useState(initialDate);
  const byDate = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const eventsByDate = new Map<string, ViewerEvent[]>();
  for (const e of events) eventsByDate.set(e.date, [...(eventsByDate.get(e.date) ?? []), e]);
  const extrasByDate = new Map<string, ExtraDayItem[]>();
  for (const x of extras) extrasByDate.set(x.date, [...(extrasByDate.get(x.date) ?? []), x]);
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
                const entryItems = byDate.get(day.date) ?? [];
                // 月の表の中では、行事・予定(休みでないもの)を先に、自分のメモ・予定、ほかのアプリの項目(TODO の期限)の順に並べる
                const chips: { id: string; time: string | null; title: string; tone: "company" | "entry" | "extra"; pending: boolean }[] = [
                  ...(eventsByDate.get(day.date) ?? [])
                    .filter((e) => e.kind === "event")
                    .map((e) => ({ id: e.id, time: e.time, title: e.title, tone: "company" as const, pending: e.canRespond && e.myResponse === null })),
                  ...entryItems.map((e) => ({ id: e.id, time: e.time, title: e.title, tone: "entry" as const, pending: false })),
                  ...(extrasByDate.get(day.date) ?? []).map((x) => ({ id: `x-${x.id}`, time: null, title: `${x.tag}: ${x.title}`, tone: "extra" as const, pending: false })),
                ];
                const isSelected = day.date === selected;
                const isToday = day.date === today;
                return (
                  <td key={di} className="border-brand01/10 h-16 border p-0 align-top md:h-24">
                    <button
                      type="button"
                      onClick={() => setSelected(day.date)}
                      aria-pressed={isSelected}
                      aria-label={`${shortDate(day.date)} ${day.kind === "off" ? "休み" : day.kind === "work" ? "出勤日" : ""} ${day.label ?? ""} ${day.offEvent ? OFF_EVENT_MARK[day.offEvent] : ""} ${(marks[day.date] ?? []).join(" ")} 予定${chips.length}件`}
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
                        {day.offEvent ? (
                          <span className="bg-brand03 px-0.5 text-[0.625rem] leading-tight font-bold whitespace-nowrap text-white">
                            {OFF_EVENT_MARK[day.offEvent]}
                          </span>
                        ) : null}
                        {(marks[day.date] ?? []).map((m) => (
                          <span key={m} aria-hidden className="max-w-full min-w-0">
                            <span className="bg-link inline-block size-2 rounded-full md:hidden" />
                            <span className="bg-link hidden max-w-full truncate px-0.5 align-bottom text-[0.625rem] leading-tight font-bold whitespace-nowrap text-white md:inline-block">
                              {m}
                            </span>
                          </span>
                        ))}
                      </span>
                      {day.label ? (
                        <span className="text-brand04 hidden truncate text-[0.6875rem] leading-tight md:block">
                          {day.label}
                        </span>
                      ) : null}
                      {chips.length > 0 ? (
                        <>
                          <span className="flex gap-0.5 md:hidden" aria-hidden>
                            {chips.slice(0, 3).map((e) => (
                              <span
                                key={e.id}
                                className={`size-1.5 rounded-full ${e.tone === "company" ? "bg-brand03" : e.tone === "extra" ? "bg-brand01" : "bg-link"}`}
                              />
                            ))}
                          </span>
                          <span className="hidden flex-col gap-0.5 md:flex">
                            {chips.slice(0, 2).map((e) => (
                              <span
                                key={e.id}
                                className={`text-brand01 truncate px-1 text-[0.6875rem] leading-snug ${
                                  e.tone === "company"
                                    ? "border-brand03 border-l-2 bg-white"
                                    : e.tone === "extra"
                                      ? "border-brand01 border-l-2 bg-white"
                                      : "bg-bg01"
                                } ${e.pending ? "font-bold" : ""}`}
                              >
                                {e.time ? `${e.time} ` : ""}
                                {e.title}
                              </span>
                            ))}
                            {chips.length > 2 ? (
                              <span className="text-brand04 text-[0.6875rem] leading-tight">ほか{chips.length - 2}件</span>
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
        <DayPanel
          key={selectedDay.date}
          day={selectedDay}
          marks={marks[selectedDay.date] ?? []}
          items={byDate.get(selectedDay.date) ?? []}
          events={eventsByDate.get(selectedDay.date) ?? []}
          extras={extrasByDate.get(selectedDay.date) ?? []}
        />
      ) : null}
    </div>
  );
}

function DayPanel({
  day,
  marks,
  items,
  events,
  extras,
}: {
  day: CalendarDay;
  marks: string[];
  items: CalendarEntry[];
  events: ViewerEvent[];
  extras: ExtraDayItem[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <aside className="border-brand01/15 flex flex-col gap-4 self-start border bg-white p-4" aria-live="polite">
      <div>
        <p className="text-brand01 text-lg font-bold">{shortDate(day.date)}</p>
        <p className={`text-sm font-bold ${day.kind === "off" ? "text-brand03" : "text-brand04"}`}>
          {day.kind === "off" ? "休み" : day.kind === "work" ? "出勤日" : "会社カレンダー未登録"}
          {day.label ? ` ・ ${day.label}` : ""}
        </p>
        {marks.length > 0 ? <p className="text-link text-sm font-bold">{marks.join(" ・ ")}</p> : null}
      </div>

      {events.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-brand01 text-sm font-bold">会社の予定</p>
          <ul className="border-brand01/15 flex flex-col border-t">
            {events.map((e) => (
              <CompanyEventItem key={e.id} event={e} />
            ))}
          </ul>
        </div>
      ) : null}

      {extras.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-brand01 text-sm font-bold">この日が期限</p>
          <ul className="border-brand01/15 flex flex-col border-t">
            {extras.map((x) => (
              <li key={x.id} className="border-brand01/15 flex flex-wrap items-center gap-x-2 gap-y-1 border-b py-3">
                <span className="border-brand01 text-brand01 border px-1 text-[0.6875rem] leading-5 font-bold whitespace-nowrap">
                  {x.tag}
                </span>
                {x.href ? (
                  <Link href={x.href} className="text-brand01 hover:text-brand03 font-bold transition-colors [overflow-wrap:anywhere]">
                    {x.title}
                  </Link>
                ) : (
                  <span className="text-brand01 font-bold [overflow-wrap:anywhere]">{x.title}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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

function CompanyEventItem({ event: e }: { event: ViewerEvent }) {
  const label = `${shortDate(e.date)}${e.time ? ` ${e.time}` : ""} ${e.title}`;
  return (
    <li className="border-brand01/15 flex flex-col gap-1.5 border-b py-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`px-1 text-[0.6875rem] leading-5 font-bold whitespace-nowrap ${
            e.kind === "event" ? "border-brand03 text-brand03 border" : "bg-brand03 text-white"
          }`}
        >
          {e.kind === "event" ? (e.visibility === "company" ? "全社" : "呼びかけ") : EVENT_KIND_LABEL[e.kind]}
        </span>
        <span className="text-brand01 font-bold [overflow-wrap:anywhere]">
          {e.time ? <span className="text-brand03 mr-2 tabular-nums">{e.time}</span> : null}
          {e.title}
        </span>
      </p>
      {e.note ? <p className="text-brand04 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{e.note}</p> : null}
      {e.invited ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-brand01 text-sm">
            あなたの返事:{" "}
            <span className={e.myResponse ? "font-bold" : "text-brand03 font-bold"}>
              {e.myResponse ? EVENT_RESPONSE_LABEL[e.myResponse] : "まだです"}
            </span>
          </p>
          {e.canRespond ? <RespondButtons eventId={e.id} current={e.myResponse} label={label} /> : null}
        </div>
      ) : null}
      {e.canEdit ? (
        <p className="text-sm">
          <Link href={`/apps/calendar/events/${e.id}`} className="text-brand01 hover:text-brand03 font-bold transition-colors">
            {e.kind === "event" && e.hasInvitees ? "編集・返事の一覧 ›" : "編集 ›"}
          </Link>
        </p>
      ) : null}
    </li>
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
