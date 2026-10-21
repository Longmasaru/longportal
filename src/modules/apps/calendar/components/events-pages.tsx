import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { canGlobally } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { EVENT_KIND_LABEL, EVENT_RESPONSE_LABEL, EVENTS_MANAGE } from "../constants";
import {
  getEditableEvent,
  listActiveAudiences,
  listInviteeOptions,
  listInviteeStatuses,
  listManageableEvents,
} from "../event-queries";
import { countResponses } from "../events";
import { isIsoDate } from "@/modules/core/shared/date";
import { shortDate } from "../logic";
import { manifest } from "../manifest";
import { DeleteEventButton, EventForm } from "./event-form";

const EVENTS_ROUTE = `${manifest.route}/events`;

function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
        CALENDAR<span className="text-brand04 ml-3 font-medium tracking-[0.1em]">会社カレンダー</span>
      </p>
      <h1 className="text-brand01 mt-2 text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

const BACK_LINK = "text-brand01 hover:text-brand03 text-sm font-bold transition-colors";

/**
 * 予定・参加の呼びかけ(一覧と登録)。docs/DESIGN.md 38 章。
 * カレンダーを使える人は名指しの呼びかけを、calendar.events.manage を持つ人は全社の予定・休み・Audience への呼びかけも作れる。
 */
export async function CalendarEventsPage({ date }: { date?: string }) {
  const actor = await requireAppAccess(manifest.appKey);
  const canManage = canGlobally(actor, EVENTS_MANAGE);
  const [rows, employees, audiences] = await Promise.all([
    listManageableEvents(actor),
    listInviteeOptions(actor),
    canManage ? listActiveAudiences() : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <p>
        <Link href={manifest.route} className={BACK_LINK}>
          ‹ カレンダーに戻る
        </Link>
      </p>
      <PageHeader title="予定・参加の呼びかけ">
        <p className="text-brand04 mt-1 text-sm">
          {canManage
            ? "全社の予定(一斉有給取得日・臨時休業・行事)を登録したり、参加の返事をお願いしたりできます。"
            : "社員を選んで、予定への参加の返事をお願いできます。予定は、自分と選んだ相手にだけ見えます。自分だけのメモは、カレンダーの日付を押して書いてください。"}
        </p>
      </PageHeader>

      <section className="flex flex-col gap-3" aria-labelledby="events-list">
        <h2 id="events-list" className="text-brand01 text-lg font-bold">
          {canManage ? "登録した予定(30 日前から)" : "あなたが作った呼びかけ(30 日前から)"}
        </h2>
        {rows.length === 0 ? (
          <p className="border-brand01/15 text-brand04 border-y py-6 text-center text-sm">まだありません。</p>
        ) : (
          <ul className="border-brand01/15 flex flex-col border-t">
            {rows.map((r) => (
              <li key={r.id} className="border-brand01/15 border-b">
                <Link
                  href={`${EVENTS_ROUTE}/${r.id}`}
                  className="hover:bg-bg01 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-3 transition-colors"
                >
                  <span className={`text-sm font-bold tabular-nums ${r.date < actor.today ? "text-brand04" : "text-brand01"}`}>
                    {shortDate(r.date)}
                    {r.time ? ` ${r.time}` : ""}
                  </span>
                  <span
                    className={`px-1 text-[0.6875rem] leading-5 font-bold ${
                      r.kind === "event" ? "border-brand03 text-brand03 border" : "bg-brand03 text-white"
                    }`}
                  >
                    {r.kind === "event" ? (r.visibility === "company" ? "全社" : "呼びかけ") : EVENT_KIND_LABEL[r.kind]}
                  </span>
                  <span className="text-brand01 font-bold [overflow-wrap:anywhere]">{r.title}</span>
                  {r.audienceName ? <span className="text-brand04 text-xs">相手: {r.audienceName}</span> : null}
                  <span className="text-brand04 ml-auto text-xs">{r.isMine ? "" : "ほかの担当者が登録"} ›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="events-new">
        <h2 id="events-new" className="text-brand01 text-lg font-bold">
          新しく登録する
        </h2>
        <EventForm
          canManage={canManage}
          audiences={audiences}
          employees={employees}
          defaultDate={date && isIsoDate(date) ? date : actor.today}
        />
      </section>
    </div>
  );
}

/** 予定の編集と、返事の一覧(編集できる人だけ。それ以外は 404)。 */
export async function CalendarEventPage({ id }: { id: string }) {
  const actor = await requireAppAccess(manifest.appKey);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const editable = await getEditableEvent(actor, id);
  if (!editable) notFound();
  const { event, inviteeIds, audienceName } = editable;
  const canManage = canGlobally(actor, EVENTS_MANAGE);
  const [statuses, employees, audiences] = await Promise.all([
    listInviteeStatuses(event, inviteeIds, actor.today),
    listInviteeOptions(actor),
    canManage ? listActiveAudiences() : Promise.resolve([]),
  ]);
  const counts = countResponses(statuses.map((s) => s.response));
  const groups = [
    { key: "yes", label: EVENT_RESPONSE_LABEL.yes, items: statuses.filter((s) => s.response === "yes") },
    { key: "no", label: EVENT_RESPONSE_LABEL.no, items: statuses.filter((s) => s.response === "no") },
    { key: "none", label: "未回答", items: statuses.filter((s) => s.response === null) },
  ];
  // 呼びかけの Audience が無効になっていても、編集画面の選択肢には今の値を残す
  const audienceOptions =
    event.audienceId && !audiences.some((a) => a.id === event.audienceId)
      ? [...audiences, { id: event.audienceId, name: `${audienceName ?? "(削除された Audience)"}(無効)` }]
      : audiences;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <p>
        <Link href={EVENTS_ROUTE} className={BACK_LINK}>
          ‹ 予定・参加の呼びかけに戻る
        </Link>
      </p>
      <PageHeader title={event.title}>
        <p className="text-brand04 mt-1 text-sm">
          {shortDate(event.date)}
          {event.time ? ` ${event.time}` : ""} ・ {EVENT_KIND_LABEL[event.kind]}
          {event.kind === "event" ? (event.visibility === "company" ? " ・ 全社に表示" : " ・ 呼びかけた相手にだけ表示") : ""}
        </p>
      </PageHeader>

      {event.kind === "event" && (statuses.length > 0 || inviteeIds.length > 0 || event.audienceId) ? (
        <section className="flex flex-col gap-3" aria-labelledby="event-responses">
          <h2 id="event-responses" className="text-brand01 text-lg font-bold">
            返事の一覧
          </h2>
          <p className="text-brand01 text-sm">
            相手 {statuses.length}名 ・ 参加 <span className="font-bold">{counts.yes}</span> ・ 不参加{" "}
            <span className="font-bold">{counts.no}</span> ・ 未回答 <span className="font-bold">{counts.none}</span>
            {audienceName ? <span className="text-brand04"> (Audience: {audienceName})</span> : null}
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {groups.map((g) => (
              <div key={g.key} className="border-brand01/15 border bg-white p-3">
                <p className="text-brand01 mb-2 text-sm font-bold">
                  {g.label}({g.items.length})
                </p>
                {g.items.length === 0 ? (
                  <p className="text-brand04 text-sm">なし</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {g.items.map((s) => (
                      <li key={s.employeeId} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-brand01 font-bold">{s.name}</span>
                        <span className="text-brand04 text-xs">{s.affiliation}</span>
                        {!s.hasAccount ? <span className="text-brand03 text-xs">アカウントなし</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="event-edit">
        <h2 id="event-edit" className="text-brand01 text-lg font-bold">
          内容を変える
        </h2>
        <p className="text-brand04 text-sm">日付・時刻を変えると、届いている返事は消えて、もう一度返事をお願いします。</p>
        <EventForm
          event={{
            id: event.id,
            kind: event.kind,
            date: event.date,
            time: event.time,
            title: event.title,
            note: event.note,
            visibility: event.visibility,
            audienceId: event.audienceId,
            inviteeIds,
          }}
          canManage={canManage}
          audiences={audienceOptions}
          employees={employees}
          defaultDate={event.date}
        />
        <DeleteEventButton id={event.id} hasResponses={counts.yes + counts.no > 0} />
      </section>
    </div>
  );
}
