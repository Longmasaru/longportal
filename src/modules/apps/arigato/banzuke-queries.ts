import { and, asc, count, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/modules/core/auth/schema";
import { employees } from "@/modules/core/employees/schema";
import {
  bashoFromKey,
  bashoOf,
  bashoWeeks,
  computeNextBanzuke,
  findYusho,
  prevBasho,
  projectionLadder,
  type Basho,
  type PrevEntry,
  type Rank,
  type Side,
} from "./banzuke";
import type { ArigatoTag } from "./constants";
import { listReceivable, pointsExpr, primaryDepartments } from "./queries";
import { arigatoBanzuke, arigatoCards, arigatoShikona } from "./schema";

// ありがとう番付の読み書き(docs/DESIGN.md 34 章)。

type Range = { start: string; end: string };
const inRange = (r: Range) => and(gte(arigatoCards.sentOn, r.start), lte(arigatoCards.sentOn, r.end));

/** 場所の中の白星(送った人ごと。加点と同じ数え方)。 */
async function winsByUser(r: Range): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: arigatoCards.fromUserId, wins: pointsExpr })
    .from(arigatoCards)
    .where(inRange(r))
    .groupBy(arigatoCards.fromUserId);
  return new Map(rows.map((x) => [x.userId, x.wins]));
}

/** 場所の中の懸賞(もらったカードの枚数。受け取った人ごと)。 */
async function receivedByUser(r: Range): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: arigatoCards.toUserId, n: count() })
    .from(arigatoCards)
    .where(inRange(r))
    .groupBy(arigatoCards.toUserId);
  return new Map(rows.map((x) => [x.userId, x.n]));
}

/**
 * いまの場所の番付を用意する。まだなければ、いちばん最近の番付とその場所の結果から作って保存する。
 * 同時に開かれても 1 回だけ作るよう、advisory lock をかけてから作る。
 */
export async function ensureBanzuke(today: string): Promise<Basho> {
  const basho = bashoOf(today);
  const exists = async (q: Pick<typeof db, "select">) =>
    (await q.select({ n: count() }).from(arigatoBanzuke).where(eq(arigatoBanzuke.basho, basho.key)))[0].n > 0;
  if (await exists(db)) return basho;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('arigato.banzuke'))`);
    if (await exists(tx)) return;

    const [latest] = await tx
      .select({ basho: sql<string | null>`max(${arigatoBanzuke.basho})` })
      .from(arigatoBanzuke)
      .where(lt(arigatoBanzuke.basho, basho.key));
    const members = await listReceivable(today);
    const activeIds = new Set(members.map((m) => m.userId));

    let prev: PrevEntry[] = [];
    if (latest?.basho) {
      const last = bashoFromKey(latest.basho);
      const before = prevBasho(last.key);
      const [rows, wins, received, ozekiYusho] = await Promise.all([
        tx.select().from(arigatoBanzuke).where(eq(arigatoBanzuke.basho, last.key)),
        winsByUser(last),
        receivedByUser(last),
        tx
          .select({ userId: arigatoBanzuke.userId })
          .from(arigatoBanzuke)
          .where(and(eq(arigatoBanzuke.basho, before.key), eq(arigatoBanzuke.yusho, true), eq(arigatoBanzuke.rank, "ozeki"))),
      ]);
      const ozekiYushoIds = new Set(ozekiYusho.map((r) => r.userId));
      prev = rows.map((r) => ({
        userId: r.userId,
        position: r.position,
        rank: r.rank,
        wins: wins.get(r.userId) ?? 0,
        received: received.get(r.userId) ?? 0,
        ozekiYushoBefore: ozekiYushoIds.has(r.userId),
      }));
      // 終わった場所の結果を、その場所の行に残す(三賞・表彰状・横綱の条件に使う)。
      const yusho = findYusho(prev);
      for (const e of prev) {
        await tx
          .update(arigatoBanzuke)
          .set({ wins: e.wins, received: e.received, yusho: e.userId === yusho })
          .where(and(eq(arigatoBanzuke.basho, last.key), eq(arigatoBanzuke.userId, e.userId)));
      }
    }

    const next = computeNextBanzuke(
      prev,
      members.map((m) => m.userId),
      activeIds,
    );
    if (next.length > 0) {
      await tx
        .insert(arigatoBanzuke)
        .values(next.map((e) => ({ basho: basho.key, ...e })))
        .onConflictDoNothing();
    }
  });
  return basho;
}

export type BanzukeRow = {
  userId: string;
  position: number;
  rank: Rank;
  side: Side;
  promoted: boolean;
  kojoWord: string | null;
  /** 四股名(まだ決めていなければ氏名)。 */
  name: string;
  hasShikona: boolean;
  departmentName: string | null;
};

/** 番付の行に、四股名(なければ氏名)と部署を付けて返す(位置の順)。 */
async function loadRows(bashoKey: string, today: string): Promise<BanzukeRow[]> {
  const rows = await db
    .select({
      userId: arigatoBanzuke.userId,
      position: arigatoBanzuke.position,
      rank: arigatoBanzuke.rank,
      side: arigatoBanzuke.side,
      promoted: arigatoBanzuke.promoted,
      kojoWord: arigatoBanzuke.kojoWord,
      shikona: arigatoShikona.name,
      employeeId: employees.id,
      employeeName: employees.name,
      loginId: users.loginId,
    })
    .from(arigatoBanzuke)
    .innerJoin(users, eq(users.id, arigatoBanzuke.userId))
    .leftJoin(employees, eq(employees.id, users.employeeId))
    .leftJoin(arigatoShikona, eq(arigatoShikona.userId, arigatoBanzuke.userId))
    .where(eq(arigatoBanzuke.basho, bashoKey))
    .orderBy(asc(arigatoBanzuke.position));
  const depts = await primaryDepartments(
    rows.flatMap((r) => (r.employeeId ? [r.employeeId] : [])),
    today,
  );
  return rows.map((r) => ({
    userId: r.userId,
    position: r.position,
    rank: r.rank,
    side: r.side,
    promoted: r.promoted,
    kojoWord: r.kojoWord,
    name: r.shikona ?? r.employeeName ?? r.loginId,
    hasShikona: r.shikona !== null,
    departmentName: r.employeeId ? (depts.get(r.employeeId)?.name ?? null) : null,
  }));
}

export type KenshoItem = { id: string; fromName: string; tag: ArigatoTag };
export type Sansho = { kind: "shukun" | "kanto" | "gino"; name: string; departmentName: string | null; detail: string };

export type BanzukePageData = {
  basho: Basho;
  rows: BanzukeRow[];
  me: BanzukeRow | null;
  myWins: number;
  myKensho: KenshoItem[];
  /** 白星がこの数で終わったら、次の場所はどの位か(いまの時点の見込み)。番付に載っていなければ空。 */
  projection: { wins: number; rank: Rank; position: number; yusho: boolean }[];
  /** 次の場所。 */
  nextBasho: Basho;
  /** 今週の一枚スタンプカード: 場所の週と、送った週か。 */
  stamps: { start: string; end: string; stamped: boolean; current: boolean; future: boolean }[];
  /** 前の場所(番付が残っていれば)。 */
  prev: {
    basho: Basho;
    yusho: { name: string; rank: Rank; side: Side; wins: number } | null;
    sansho: Sansho[];
  } | null;
};

/** 番付の画面に出すもの一式。 */
export async function getBanzukePage(userId: string, today: string): Promise<BanzukePageData> {
  const basho = await ensureBanzuke(today);
  const soFar: Range = { start: basho.start, end: today };
  const weeks = bashoWeeks(basho);

  const [rows, myWinsRow, kensho, mySentDays, prevKeyRow] = await Promise.all([
    loadRows(basho.key, today),
    db
      .select({ wins: pointsExpr })
      .from(arigatoCards)
      .where(and(eq(arigatoCards.fromUserId, userId), inRange(soFar))),
    db
      .select({ id: arigatoCards.id, fromUserId: arigatoCards.fromUserId, tag: arigatoCards.tag })
      .from(arigatoCards)
      .where(and(eq(arigatoCards.toUserId, userId), inRange(soFar)))
      .orderBy(desc(arigatoCards.createdAt))
      .limit(30),
    db
      .selectDistinct({ day: arigatoCards.sentOn })
      .from(arigatoCards)
      .where(and(eq(arigatoCards.fromUserId, userId), inRange(soFar))),
    db
      .select({ basho: sql<string | null>`max(${arigatoBanzuke.basho})` })
      .from(arigatoBanzuke)
      .where(lt(arigatoBanzuke.basho, basho.key)),
  ]);

  const names = await displayNames(
    kensho.map((k) => k.fromUserId),
    today,
  );
  const days = mySentDays.map((d) => d.day);
  const stamps = weeks.map((w) => ({
    ...w,
    stamped: days.some((d) => d >= w.start && d <= w.end),
    current: w.start <= today && today <= w.end,
    future: w.start > today,
  }));

  const myWins = myWinsRow[0]?.wins ?? 0;
  return {
    basho,
    rows,
    me: rows.find((r) => r.userId === userId) ?? null,
    myWins,
    projection: await loadProjection(basho, soFar, rows, userId, myWins),
    nextBasho: bashoFromKey(nextBashoKey(basho.key)),
    myKensho: kensho.map((k) => ({ id: k.id, fromName: names.get(k.fromUserId)?.name ?? "", tag: k.tag })),
    stamps,
    prev: prevKeyRow[0]?.basho ? await loadPrevResults(bashoFromKey(prevKeyRow[0].basho), today) : null,
  };
}

/** 次の場所の key(2 か月後。11 月の次は翌年 1 月)。 */
function nextBashoKey(key: string): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return m === 11 ? `${y + 1}-01` : `${y}-${String(m + 2).padStart(2, "0")}`;
}

/** 自分の白星がいくつで終わったら、次の場所でどの位になるか。ほかの人の白星は、いまの時点のまま数える。 */
async function loadProjection(basho: Basho, soFar: Range, rows: BanzukeRow[], userId: string, myWins: number) {
  if (!rows.some((r) => r.userId === userId)) return [];
  const before = prevBasho(basho.key);
  const [wins, received, ozekiYusho] = await Promise.all([
    winsByUser(soFar),
    receivedByUser(soFar),
    db
      .select({ userId: arigatoBanzuke.userId })
      .from(arigatoBanzuke)
      .where(and(eq(arigatoBanzuke.basho, before.key), eq(arigatoBanzuke.yusho, true), eq(arigatoBanzuke.rank, "ozeki"))),
  ]);
  const ozekiYushoIds = new Set(ozekiYusho.map((r) => r.userId));
  const entries: PrevEntry[] = rows.map((r) => ({
    userId: r.userId,
    position: r.position,
    rank: r.rank,
    wins: wins.get(r.userId) ?? 0,
    received: received.get(r.userId) ?? 0,
    ozekiYushoBefore: ozekiYushoIds.has(r.userId),
  }));
  return projectionLadder(entries, userId, myWins);
}

/** 四股名(なければ氏名)と部署。 */
async function displayNames(userIds: string[], today: string): Promise<Map<string, { name: string; departmentName: string | null }>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      userId: users.id,
      loginId: users.loginId,
      employeeId: employees.id,
      employeeName: employees.name,
      shikona: arigatoShikona.name,
    })
    .from(users)
    .leftJoin(employees, eq(employees.id, users.employeeId))
    .leftJoin(arigatoShikona, eq(arigatoShikona.userId, users.id))
    .where(inArray(users.id, ids));
  const depts = await primaryDepartments(
    rows.flatMap((r) => (r.employeeId ? [r.employeeId] : [])),
    today,
  );
  return new Map(
    rows.map((r) => [
      r.userId,
      {
        name: r.shikona ?? r.employeeName ?? r.loginId,
        departmentName: r.employeeId ? (depts.get(r.employeeId)?.name ?? null) : null,
      },
    ]),
  );
}

/** 終わった場所の優勝と三賞。 */
async function loadPrevResults(prev: Basho, today: string): Promise<NonNullable<BanzukePageData["prev"]>> {
  const before = prevBasho(prev.key);
  const [rows, beforeRows, shukun, gino] = await Promise.all([
    db.select().from(arigatoBanzuke).where(eq(arigatoBanzuke.basho, prev.key)),
    db
      .select({ userId: arigatoBanzuke.userId, wins: arigatoBanzuke.wins })
      .from(arigatoBanzuke)
      .where(eq(arigatoBanzuke.basho, before.key)),
    // 殊勲賞: いちばん多くの人に送った(2 人以上)
    db
      .select({ userId: arigatoCards.fromUserId, n: sql<number>`count(distinct ${arigatoCards.toUserId})::int` })
      .from(arigatoCards)
      .where(inRange(prev))
      .groupBy(arigatoCards.fromUserId)
      .orderBy(desc(sql`count(distinct ${arigatoCards.toUserId})`))
      .limit(1),
    // 技能賞: 「教えてくれた」をいちばん多くもらった
    db
      .select({ userId: arigatoCards.toUserId, n: count() })
      .from(arigatoCards)
      .where(and(inRange(prev), eq(arigatoCards.tag, "taught")))
      .groupBy(arigatoCards.toUserId)
      .orderBy(desc(count()))
      .limit(1),
  ]);

  // 敢闘賞: 前の場所から白星がいちばん増えた(増えた人がいれば)
  const beforeWins = new Map(beforeRows.map((r) => [r.userId, r.wins ?? 0]));
  const kanto = rows
    .filter((r) => r.wins !== null)
    .map((r) => ({ userId: r.userId, from: beforeWins.get(r.userId) ?? 0, to: r.wins ?? 0 }))
    .sort((a, b) => b.to - b.from - (a.to - a.from))[0];

  const yushoRow = rows.find((r) => r.yusho) ?? null;
  const ids = [yushoRow?.userId, shukun[0]?.userId, gino[0]?.userId, kanto?.userId].filter((x): x is string => !!x);
  const names = await displayNames(ids, today);
  const who = (id: string) => names.get(id) ?? { name: "", departmentName: null };

  const sansho: Sansho[] = [];
  if (shukun[0] && shukun[0].n >= 2) {
    sansho.push({ kind: "shukun", ...who(shukun[0].userId), detail: `${shukun[0].n} 人に送った` });
  }
  if (kanto && kanto.to > kanto.from) {
    sansho.push({ kind: "kanto", ...who(kanto.userId), detail: `白星 ${kanto.from} から ${kanto.to} へ` });
  }
  if (gino[0]) {
    sansho.push({ kind: "gino", ...who(gino[0].userId), detail: `「教えてくれた」を ${gino[0].n} 枚もらった` });
  }
  return {
    basho: prev,
    yusho: yushoRow
      ? { name: who(yushoRow.userId).name, rank: yushoRow.rank, side: yushoRow.side, wins: yushoRow.wins ?? 0 }
      : null,
    sansho,
  };
}

/** アプリの画面の上に出す、自分の位と今場所の白星。 */
export async function getMyBanzukeSummary(
  userId: string,
  today: string,
): Promise<{ basho: Basho; rank: Rank | null; place: number | null; total: number; wins: number }> {
  const basho = await ensureBanzuke(today);
  const [[mine], [{ total }], [winsRow]] = await Promise.all([
    db
      .select({ rank: arigatoBanzuke.rank, position: arigatoBanzuke.position })
      .from(arigatoBanzuke)
      .where(and(eq(arigatoBanzuke.basho, basho.key), eq(arigatoBanzuke.userId, userId))),
    db.select({ total: count() }).from(arigatoBanzuke).where(eq(arigatoBanzuke.basho, basho.key)),
    db
      .select({ wins: pointsExpr })
      .from(arigatoCards)
      .where(and(eq(arigatoCards.fromUserId, userId), inRange({ start: basho.start, end: today }))),
  ]);
  return {
    basho,
    rank: mine?.rank ?? null,
    place: mine?.position ?? null,
    total,
    wins: winsRow?.wins ?? 0,
  };
}

/** 四股名を選ぶときに使う、本人の姓。 */
export async function getFamilyName(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ familyName: employees.familyName })
    .from(users)
    .innerJoin(employees, eq(employees.id, users.employeeId))
    .where(eq(users.id, userId));
  return row?.familyName ?? null;
}

/** 使われている四股名(候補を選べなくするため)。 */
export async function takenShikona(names: string[], exceptUserId: string): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  const rows = await db
    .select({ name: arigatoShikona.name, userId: arigatoShikona.userId })
    .from(arigatoShikona)
    .where(inArray(arigatoShikona.name, names));
  return new Set(rows.filter((r) => r.userId !== exceptUserId).map((r) => r.name));
}
