import { and, asc, eq, exists, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { canGlobally, evaluateEmployeeAccess, type Actor } from "@/modules/core/access";
import {
  evaluateDefinition,
  listAudiences,
  loadActiveDefinitions,
  loadPopulation,
  matchedAudienceIds,
} from "@/modules/core/audience";
import { audiences } from "@/modules/core/audience/schema";
import { users } from "@/modules/core/auth/schema";
import { addDays } from "@/modules/core/shared/date";
import { EVENTS_MANAGE, OFF_EVENT_KINDS, type EventResponse } from "./constants";
import { canEditEvent, canRespond, canSeeEvent, isInvited, needsResponse } from "./events";
import {
  calendarCompanyEvents,
  calendarEventInvitees,
  calendarEventResponses,
  type CompanyEventRow,
} from "./schema";
import type { InviteeOption, InviteeStatus, PendingInvitation, ViewerEvent } from "./types";

// 全社の予定・参加の呼びかけの読み取り(docs/DESIGN.md 38 章)。deny by default:
// 見る人ごとに、見える条件(canSeeEvent)と呼びかけの相手か(isInvited。Audience は matchedAudienceIds で毎回評価)を通す。

const ORDER = [
  asc(calendarCompanyEvents.date),
  sql`${calendarCompanyEvents.time} asc nulls first`,
  asc(calendarCompanyEvents.createdAt),
] as const;

/** 予定ごとに「見る人が相手か」を判定する関数を作る(名指しと Audience をまとめて読む)。 */
async function invitationResolver(actor: Actor, rows: CompanyEventRow[]): Promise<(row: CompanyEventRow) => boolean> {
  const employeeId = actor.employee?.id ?? null;
  const eventIds = rows.filter((r) => r.kind === "event").map((r) => r.id);
  const [matched, named] = await Promise.all([
    matchedAudienceIds(
      employeeId,
      rows.flatMap((r) => (r.kind === "event" && r.audienceId ? [r.audienceId] : [])),
      actor.today,
    ),
    employeeId && eventIds.length
      ? db
          .select({ eventId: calendarEventInvitees.eventId })
          .from(calendarEventInvitees)
          .where(and(eq(calendarEventInvitees.employeeId, employeeId), inArray(calendarEventInvitees.eventId, eventIds)))
      : Promise.resolve([]),
  ]);
  const namedEvents = new Set(named.map((n) => n.eventId));
  const viewer = { userId: actor.userId, employeeId, matchedAudienceIds: matched };
  const self = employeeId ? new Set([employeeId]) : new Set<string>();
  return (row) => isInvited(row, viewer, namedEvents.has(row.id) ? self : new Set());
}

async function myResponses(userId: string, eventIds: string[]): Promise<Map<string, EventResponse>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db
    .select({ eventId: calendarEventResponses.eventId, response: calendarEventResponses.response })
    .from(calendarEventResponses)
    .where(and(eq(calendarEventResponses.userId, userId), inArray(calendarEventResponses.eventId, eventIds)));
  return new Map(rows.map((r) => [r.eventId, r.response]));
}

/** 名指しの相手がいる予定の id */
async function eventsWithNamedInvitees(eventIds: string[]): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ eventId: calendarEventInvitees.eventId })
    .from(calendarEventInvitees)
    .where(inArray(calendarEventInvitees.eventId, eventIds));
  return new Set(rows.map((r) => r.eventId));
}

/** 見る人に見える、期間内(両端を含む)の全社の予定・呼びかけ。 */
export async function listEventsForViewer(actor: Actor, from: string, to: string): Promise<ViewerEvent[]> {
  const rows = await db
    .select()
    .from(calendarCompanyEvents)
    .where(and(gte(calendarCompanyEvents.date, from), lte(calendarCompanyEvents.date, to)))
    .orderBy(...ORDER);
  if (rows.length === 0) return [];

  const invited = await invitationResolver(actor, rows);
  const viewer = { userId: actor.userId, employeeId: actor.employee?.id ?? null, matchedAudienceIds: new Set<string>() };
  const visible = rows.filter((r) => canSeeEvent(r, viewer, invited(r)));
  const canManage = canGlobally(actor, EVENTS_MANAGE);
  const [responses, named] = await Promise.all([
    myResponses(
      actor.userId,
      visible.map((r) => r.id),
    ),
    eventsWithNamedInvitees(visible.map((r) => r.id)),
  ]);
  return visible.map((r) => {
    const isInv = invited(r);
    return {
      id: r.id,
      kind: r.kind,
      date: r.date,
      time: r.time,
      title: r.title,
      note: r.note,
      visibility: r.visibility,
      invited: isInv,
      myResponse: responses.get(r.id) ?? null,
      canRespond: canRespond(r, isInv, actor.today),
      canEdit: canEditEvent(r, { userId: actor.userId, canManage }),
      hasInvitees: r.audienceId !== null || named.has(r.id),
    };
  });
}

/**
 * 全社の休み(一斉有給取得日・臨時休業)。休みの判定(連休のカウントダウンなど)に重ねるため、表示中の月に関係なく読む。
 * 件数は年に数件の想定なので、前の年からの分をまとめて読む。
 */
export async function listOffDayEvents(today: string) {
  const since = `${Number(today.slice(0, 4)) - 1}-01-01`;
  return db
    .select({ date: calendarCompanyEvents.date, kind: calendarCompanyEvents.kind, title: calendarCompanyEvents.title })
    .from(calendarCompanyEvents)
    .where(and(inArray(calendarCompanyEvents.kind, [...OFF_EVENT_KINDS]), gte(calendarCompanyEvents.date, since)))
    .orderBy(asc(calendarCompanyEvents.createdAt));
}

/** 返事のお願い(相手で、まだ返事をしておらず、予定の日が過ぎていないもの)。日付の近い順。 */
export async function listPendingInvitations(actor: Actor): Promise<PendingInvitation[]> {
  const employeeId = actor.employee?.id;
  if (!employeeId) return [];
  const rows = await db
    .select()
    .from(calendarCompanyEvents)
    .where(
      and(
        eq(calendarCompanyEvents.kind, "event"),
        gte(calendarCompanyEvents.date, actor.today),
        or(
          isNotNull(calendarCompanyEvents.audienceId),
          exists(
            db
              .select({ one: sql`1` })
              .from(calendarEventInvitees)
              .where(
                and(
                  eq(calendarEventInvitees.eventId, calendarCompanyEvents.id),
                  eq(calendarEventInvitees.employeeId, employeeId),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(...ORDER);
  if (rows.length === 0) return [];
  const invited = await invitationResolver(actor, rows);
  const targets = rows.filter((r) => invited(r));
  const responses = await myResponses(
    actor.userId,
    targets.map((r) => r.id),
  );
  return targets
    .filter((r) => needsResponse(r, true, responses.get(r.id) ?? null, actor.today))
    .map((r) => ({ id: r.id, date: r.date, time: r.time, title: r.title }));
}

/** 返事をしてよい予定か(相手で、予定の日が過ぎていない)。返事の Server Action で使う。 */
export async function getRespondableEvent(actor: Actor, id: string): Promise<CompanyEventRow | null> {
  const [row] = await db.select().from(calendarCompanyEvents).where(eq(calendarCompanyEvents.id, id)).limit(1);
  if (!row) return null;
  const invited = await invitationResolver(actor, [row]);
  return canRespond(row, invited(row), actor.today) ? row : null;
}

export type EditableEvent = {
  event: CompanyEventRow;
  inviteeIds: string[];
  audienceName: string | null;
};

/** 編集できる予定(できなければ null = 404)。 */
export async function getEditableEvent(actor: Actor, id: string): Promise<EditableEvent | null> {
  const [row] = await db
    .select({ event: calendarCompanyEvents, audienceName: audiences.name })
    .from(calendarCompanyEvents)
    .leftJoin(audiences, eq(audiences.id, calendarCompanyEvents.audienceId))
    .where(eq(calendarCompanyEvents.id, id))
    .limit(1);
  if (!row) return null;
  if (!canEditEvent(row.event, { userId: actor.userId, canManage: canGlobally(actor, EVENTS_MANAGE) })) return null;
  const invitees = await db
    .select({ employeeId: calendarEventInvitees.employeeId })
    .from(calendarEventInvitees)
    .where(eq(calendarEventInvitees.eventId, id));
  return { event: row.event, inviteeIds: invitees.map((i) => i.employeeId), audienceName: row.audienceName };
}

/**
 * 返事の一覧。相手はいま評価する(名指し + Audience。いまログインできる社員だけ、登録した本人は除く)。
 * 呼び出し側で編集できること(getEditableEvent)を確かめてから呼ぶ。
 */
export async function listInviteeStatuses(event: CompanyEventRow, inviteeIds: string[], today: string): Promise<InviteeStatus[]> {
  if (event.kind !== "event") return [];
  const [population, definitions, creator] = await Promise.all([
    loadPopulation(today),
    loadActiveDefinitions(event.audienceId ? [event.audienceId] : []),
    event.createdBy
      ? db.select({ employeeId: users.employeeId }).from(users).where(eq(users.id, event.createdBy)).limit(1)
      : Promise.resolve([]),
  ]);
  const creatorEmployeeId = creator[0]?.employeeId ?? null;
  const accessible = new Set(
    population.contexts.filter((c) => evaluateEmployeeAccess(c, today) === null).map((c) => c.employeeId),
  );
  const ids = new Set(inviteeIds.filter((id) => accessible.has(id)));
  const def = event.audienceId ? definitions.get(event.audienceId) : undefined;
  if (def) for (const e of evaluateDefinition(def, population, today)) ids.add(e.employeeId);
  if (creatorEmployeeId) ids.delete(creatorEmployeeId);
  if (ids.size === 0) return [];

  const [accounts, responses] = await Promise.all([
    db
      .select({ id: users.id, employeeId: users.employeeId })
      .from(users)
      .where(inArray(users.employeeId, [...ids])),
    db
      .select({ userId: calendarEventResponses.userId, response: calendarEventResponses.response })
      .from(calendarEventResponses)
      .where(eq(calendarEventResponses.eventId, event.id)),
  ]);
  const userByEmployee = new Map(accounts.map((a) => [a.employeeId!, a.id]));
  const responseByUser = new Map(responses.map((r) => [r.userId, r.response]));
  // 社員番号の順(loadPopulation の並び)
  return population.contexts
    .filter((c) => ids.has(c.employeeId))
    .map((c): InviteeStatus => {
      const info = population.info.get(c.employeeId)!;
      const userId = userByEmployee.get(c.employeeId);
      return {
        employeeId: c.employeeId,
        employeeNumber: info.employeeNumber,
        name: info.name,
        affiliation: info.affiliation,
        hasAccount: userId !== undefined,
        response: userId ? (responseByUser.get(userId) ?? null) : null,
      };
    });
}

export type ManageableEventRow = {
  id: string;
  kind: CompanyEventRow["kind"];
  date: string;
  time: string | null;
  title: string;
  visibility: CompanyEventRow["visibility"];
  audienceName: string | null;
  isMine: boolean;
};

/** 予定・呼びかけの画面の一覧(編集できるもの。30 日前から先)。 */
export async function listManageableEvents(actor: Actor): Promise<ManageableEventRow[]> {
  const canManage = canGlobally(actor, EVENTS_MANAGE);
  const rows = await db
    .select({ event: calendarCompanyEvents, audienceName: audiences.name })
    .from(calendarCompanyEvents)
    .leftJoin(audiences, eq(audiences.id, calendarCompanyEvents.audienceId))
    .where(
      and(
        gte(calendarCompanyEvents.date, addDays(actor.today, -30)),
        canManage
          ? or(eq(calendarCompanyEvents.visibility, "company"), eq(calendarCompanyEvents.createdBy, actor.userId))
          : and(eq(calendarCompanyEvents.visibility, "invitees"), eq(calendarCompanyEvents.createdBy, actor.userId)),
      ),
    )
    .orderBy(...ORDER);
  return rows
    .filter((r) => canEditEvent(r.event, { userId: actor.userId, canManage }))
    .map(({ event: e, audienceName }) => ({
      id: e.id,
      kind: e.kind,
      date: e.date,
      time: e.time,
      title: e.title,
      visibility: e.visibility,
      audienceName,
      isMine: e.createdBy === actor.userId,
    }));
}

/** 呼びかけの相手の候補: 在籍中で、有効なアカウントのある社員(自分を除く。社員番号の順)。 */
export async function listInviteeOptions(actor: Actor): Promise<InviteeOption[]> {
  const [population, accounts] = await Promise.all([
    loadPopulation(actor.today),
    db
      .select({ employeeId: users.employeeId })
      .from(users)
      .where(and(eq(users.status, "active"), isNotNull(users.employeeId))),
  ]);
  const withAccount = new Set(accounts.map((a) => a.employeeId!));
  const self = actor.employee?.id;
  return population.contexts
    .filter((c) => c.employeeId !== self && withAccount.has(c.employeeId) && evaluateEmployeeAccess(c, actor.today) === null)
    .map((c) => {
      const info = population.info.get(c.employeeId)!;
      return {
        id: c.employeeId,
        employeeNumber: info.employeeNumber,
        name: info.name,
        nameKana: population.kana.get(c.employeeId) ?? "",
        affiliation: info.affiliation,
      };
    });
}

/** 呼びかけに使える Audience(有効なものだけ)。 */
export async function listActiveAudiences(): Promise<{ id: string; name: string }[]> {
  return (await listAudiences()).filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name }));
}
