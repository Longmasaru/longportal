import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { users } from "@/modules/core/auth/schema";
import { departments } from "@/modules/core/departments/schema";
import { employeeAssignments, employees } from "@/modules/core/employees/schema";
import {
  ARIGATO_TAGS,
  FEED_LIMIT,
  addDays,
  monthRange,
  weekRange,
  type ArigatoTag,
  type ArigatoVisibility,
} from "./constants";
import { arigatoCards, arigatoLikes } from "./schema";

// ありがとうカードの読み取り(docs/DESIGN.md 26 章)。
// 「本人にだけ」(private)のカードは、送った人と受け取った人以外には本文を返さない。

export type Recipient = { userId: string; name: string; departmentName: string | null };

export type CardRow = {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  tag: ArigatoTag;
  message: string;
  visibility: ArigatoVisibility;
  /** ISO 8601 */
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
};

const fromUser = alias(users, "from_user");
const toUser = alias(users, "to_user");
const fromEmployee = alias(employees, "from_employee");
const toEmployee = alias(employees, "to_employee");

/** 基準日に有効な主所属の部署(社員でない・未配属なら null)。 */
export async function primaryDepartments(employeeIds: string[], today: string): Promise<Map<string, { id: string; name: string }>> {
  if (employeeIds.length === 0) return new Map();
  const rows = await db
    .select({ employeeId: employeeAssignments.employeeId, id: departments.id, name: departments.name })
    .from(employeeAssignments)
    .innerJoin(departments, eq(departments.id, employeeAssignments.departmentId))
    .where(
      and(
        inArray(employeeAssignments.employeeId, employeeIds),
        eq(employeeAssignments.isPrimary, true),
        lte(employeeAssignments.startDate, today),
        or(isNull(employeeAssignments.endDate), gte(employeeAssignments.endDate, today)),
      ),
    );
  return new Map(rows.map((r) => [r.employeeId, { id: r.id, name: r.name }]));
}

/** 受け取れる人の条件: 有効なアカウントがあり、在籍中(入社日〜退職日)の社員。 */
function receivableWhere(today: string) {
  return and(
    eq(users.status, "active"),
    inArray(employees.status, ["active", "leave"]),
    lte(employees.hiredOn, today),
    or(isNull(employees.leftOn), gte(employees.leftOn, today)),
  );
}

/** 在籍中でアカウントのある社員(フリガナ順)。除く人を指定できる。 */
export async function listReceivable(today: string, excludeUserId?: string): Promise<Recipient[]> {
  const rows = await db
    .select({ userId: users.id, employeeId: employees.id, name: employees.name })
    .from(users)
    .innerJoin(employees, eq(employees.id, users.employeeId))
    .where(and(receivableWhere(today), excludeUserId ? ne(users.id, excludeUserId) : undefined))
    .orderBy(asc(employees.nameKana), asc(employees.name));
  const depts = await primaryDepartments(
    rows.map((r) => r.employeeId),
    today,
  );
  return rows.map((r) => ({ userId: r.userId, name: r.name, departmentName: depts.get(r.employeeId)?.name ?? null }));
}

/** 送り先の候補(自分以外。フリガナ順)。 */
export function listRecipients(selfUserId: string, today: string): Promise<Recipient[]> {
  return listReceivable(today, selfUserId);
}

/** 送り先として有効か。有効なら、送った時点の主所属の部署 id(未配属は null)を返す。 */
export async function checkRecipient(
  toUserId: string,
  today: string,
): Promise<{ ok: true; departmentId: string | null } | { ok: false }> {
  const [row] = await db
    .select({ employeeId: employees.id })
    .from(users)
    .innerJoin(employees, eq(employees.id, users.employeeId))
    .where(and(eq(users.id, toUserId), receivableWhere(today)));
  if (!row) return { ok: false };
  const depts = await primaryDepartments([row.employeeId], today);
  return { ok: true, departmentId: depts.get(row.employeeId)?.id ?? null };
}

/** その人が、その日(JST)に送った枚数。 */
export async function countSentOn(userId: string, day: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(arigatoCards)
    .where(and(eq(arigatoCards.fromUserId, userId), eq(arigatoCards.sentOn, day)));
  return row?.n ?? 0;
}

const nameOf = (u: typeof fromUser | typeof toUser, e: typeof fromEmployee | typeof toEmployee) =>
  sql<string>`coalesce(${e.name}, ${u.loginId})`;

async function selectCards(viewerId: string, where: ReturnType<typeof and>, limit: number): Promise<CardRow[]> {
  const rows = await db
    .select({
      id: arigatoCards.id,
      fromUserId: arigatoCards.fromUserId,
      fromName: nameOf(fromUser, fromEmployee),
      toUserId: arigatoCards.toUserId,
      toName: nameOf(toUser, toEmployee),
      tag: arigatoCards.tag,
      message: arigatoCards.message,
      visibility: arigatoCards.visibility,
      createdAt: arigatoCards.createdAt,
      likeCount: sql<number>`(select count(*)::int from ${arigatoLikes} where ${arigatoLikes.cardId} = ${arigatoCards.id})`,
      likedByMe: sql<boolean>`exists (select 1 from ${arigatoLikes} where ${arigatoLikes.cardId} = ${arigatoCards.id} and ${arigatoLikes.userId} = ${viewerId})`,
    })
    .from(arigatoCards)
    .innerJoin(fromUser, eq(fromUser.id, arigatoCards.fromUserId))
    .leftJoin(fromEmployee, eq(fromEmployee.id, fromUser.employeeId))
    .innerJoin(toUser, eq(toUser.id, arigatoCards.toUserId))
    .leftJoin(toEmployee, eq(toEmployee.id, toUser.employeeId))
    .where(where)
    .orderBy(desc(arigatoCards.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** 見る人が本文を読めるカードの条件。 */
function readableBy(viewerId: string) {
  return or(
    eq(arigatoCards.visibility, "public"),
    eq(arigatoCards.fromUserId, viewerId),
    eq(arigatoCards.toUserId, viewerId),
  );
}

/** 「みんな」: 公開カードと、自分が関わる「本人にだけ」のカード(新しい順)。 */
export function listFeed(viewerId: string): Promise<CardRow[]> {
  return selectCards(viewerId, and(readableBy(viewerId)), FEED_LIMIT);
}

/** 「自分あて」: 受け取ったカード(新しい順)。 */
export function listReceived(viewerId: string): Promise<CardRow[]> {
  return selectCards(viewerId, and(eq(arigatoCards.toUserId, viewerId)), 200);
}

/** 1 枚(見る人が読めるものだけ)。 */
export async function getCard(viewerId: string, id: string): Promise<CardRow | null> {
  const [row] = await selectCards(viewerId, and(eq(arigatoCards.id, id), readableBy(viewerId)), 1);
  return row ?? null;
}

export type WeekStatus = {
  /** 今週、本人が 1 枚でも送ったか。 */
  sentThisWeek: boolean;
  thisWeekCount: number;
  lastWeekCount: number;
  /** 先週いちばん多かった「どんなこと」(0 件なら null)。 */
  lastWeekTopTag: ArigatoTag | null;
};

/** 今週の一枚(週は月曜はじまり、JST)と、全社の今週・先週の件数。 */
export async function getWeekStatus(userId: string, today: string): Promise<WeekStatus> {
  const thisWeek = weekRange(today);
  const lastWeek = { start: addDays(thisWeek.start, -7), end: addDays(thisWeek.start, -1) };
  const inRange = (r: { start: string; end: string }) =>
    and(gte(arigatoCards.sentOn, r.start), lte(arigatoCards.sentOn, r.end));

  const [[mine], [thisCount], lastByTag] = await Promise.all([
    db
      .select({ n: count() })
      .from(arigatoCards)
      .where(and(eq(arigatoCards.fromUserId, userId), inRange(thisWeek))),
    db.select({ n: count() }).from(arigatoCards).where(inRange(thisWeek)),
    db
      .select({ tag: arigatoCards.tag, n: count() })
      .from(arigatoCards)
      .where(inRange(lastWeek))
      .groupBy(arigatoCards.tag),
  ]);
  const sorted = [...lastByTag].sort(
    (a, b) => b.n - a.n || ARIGATO_TAGS.indexOf(a.tag) - ARIGATO_TAGS.indexOf(b.tag),
  );
  return {
    sentThisWeek: (mine?.n ?? 0) > 0,
    thisWeekCount: thisCount?.n ?? 0,
    lastWeekCount: lastByTag.reduce((sum, r) => sum + r.n, 0),
    lastWeekTopTag: sorted[0]?.tag ?? null,
  };
}

/**
 * 加点(docs/DESIGN.md 26 章): 送ったカード 1 枚につき 1 点。ただし同じ相手には 1 日 1 点まで
 * (同じ日に同じ人へ何枚送っても 1 点)。「本人にだけ」のカードも数え、取り消したカードは数えない。
 */
export const pointsExpr = sql<number>`count(distinct (${arigatoCards.toUserId}, ${arigatoCards.sentOn}))::int`;

function monthWhere(month: string) {
  const range = monthRange(month);
  return and(gte(arigatoCards.sentOn, range.start), lte(arigatoCards.sentOn, range.end));
}

/** その人の、その月の加点と送った枚数。 */
export async function getMonthPoints(userId: string, month: string): Promise<{ points: number; cards: number }> {
  const [row] = await db
    .select({ points: pointsExpr, cards: count() })
    .from(arigatoCards)
    .where(and(eq(arigatoCards.fromUserId, userId), monthWhere(month)));
  return { points: row?.points ?? 0, cards: row?.cards ?? 0 };
}

export type SenderPoints = { userId: string; name: string; departmentName: string | null; points: number; cards: number };

export type MonthStats = {
  month: string;
  total: number;
  senders: number;
  byTag: { tag: ArigatoTag; count: number }[];
  byDepartment: { name: string; count: number }[];
  topReceivers: { name: string; count: number }[];
  /** 在籍中の全員(0 点の人も含む)と、その月に送った人の加点。点数の多い順。 */
  senderPoints: SenderPoints[];
};

/** 月の集計(「本人にだけ」のカードも件数には含める。本文は返さない)。 */
export async function getMonthStats(month: string, today: string): Promise<MonthStats> {
  const where = monthWhere(month);

  const [[totals], byTag, byDepartment, topReceivers, pointRows, members] = await Promise.all([
    db
      .select({ total: count(), senders: sql<number>`count(distinct ${arigatoCards.fromUserId})::int` })
      .from(arigatoCards)
      .where(where),
    db.select({ tag: arigatoCards.tag, count: count() }).from(arigatoCards).where(where).groupBy(arigatoCards.tag),
    db
      .select({ name: sql<string>`coalesce(${departments.name}, '未配属')`, count: count() })
      .from(arigatoCards)
      .leftJoin(departments, eq(departments.id, arigatoCards.toDepartmentId))
      .where(where)
      .groupBy(departments.name)
      .orderBy(desc(count()), asc(departments.name)),
    db
      .select({ name: nameOf(toUser, toEmployee), count: count() })
      .from(arigatoCards)
      .innerJoin(toUser, eq(toUser.id, arigatoCards.toUserId))
      .leftJoin(toEmployee, eq(toEmployee.id, toUser.employeeId))
      .where(where)
      .groupBy(toUser.id, toUser.loginId, toEmployee.name)
      .orderBy(desc(count()), asc(toEmployee.name))
      .limit(10),
    db
      .select({ userId: arigatoCards.fromUserId, name: nameOf(fromUser, fromEmployee), points: pointsExpr, cards: count() })
      .from(arigatoCards)
      .innerJoin(fromUser, eq(fromUser.id, arigatoCards.fromUserId))
      .leftJoin(fromEmployee, eq(fromEmployee.id, fromUser.employeeId))
      .where(where)
      .groupBy(arigatoCards.fromUserId, fromUser.loginId, fromEmployee.name),
    listReceivable(today),
  ]);

  // 在籍中の全員を 0 点で並べ、送った人の点数を重ねる(退職などで一覧にいない送り主も残す)。
  const byUser = new Map<string, SenderPoints>(members.map((m) => [m.userId, { ...m, points: 0, cards: 0 }]));
  for (const r of pointRows) {
    const base = byUser.get(r.userId) ?? { userId: r.userId, name: r.name, departmentName: null, points: 0, cards: 0 };
    byUser.set(r.userId, { ...base, points: r.points, cards: r.cards });
  }
  const order = new Map(members.map((m, i) => [m.userId, i]));
  const senderPoints = [...byUser.values()].sort(
    (a, b) => b.points - a.points || (order.get(a.userId) ?? Infinity) - (order.get(b.userId) ?? Infinity),
  );

  const tagCounts = new Map(byTag.map((r) => [r.tag, r.count]));
  return {
    month,
    total: totals?.total ?? 0,
    senders: totals?.senders ?? 0,
    byTag: ARIGATO_TAGS.map((tag) => ({ tag, count: tagCounts.get(tag) ?? 0 })),
    byDepartment,
    topReceivers,
    senderPoints,
  };
}
