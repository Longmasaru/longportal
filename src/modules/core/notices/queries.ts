import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Actor } from "../access";
import { evaluateEmployeeAccess } from "../access/evaluate";
import {
  evaluateDefinition,
  loadActiveDefinitions,
  loadPopulation,
  matchedAudienceIds,
} from "../audience";
import { audiences } from "../audience/schema";
import { users } from "../auth/schema";
import { isNoticeAddressedTo, isNoticeBanner, summarize } from "./logic";
import {
  announcementAttachments,
  announcementReads,
  announcementRecipients,
  announcements,
  type Announcement,
  type NoticeKind,
  type NoticePriority,
  type NoticeTarget,
} from "./schema";

// ---- 社員(見る人)向け ----------------------------------------------------------

/** 見る人から見たお知らせ(宛先の判定を通ったものだけ)。 */
export type ViewerNotice = {
  id: string;
  title: string;
  body: string;
  summary: string;
  kind: NoticeKind;
  priority: NoticePriority;
  target: NoticeTarget;
  publishedOn: string;
  expiresOn: string | null;
  /** ホーム上部のバナーに出すか(全社宛の緊急で、バナーの最終日まで)。 */
  isBanner: boolean;
  bannerUntil: string | null;
  /** 確認ボタンを出すお知らせか。 */
  requiresAction: boolean;
  isRead: boolean;
  /** 確認済みか(確認ボタンを押したか)。 */
  isAcknowledged: boolean;
};

/**
 * 見る人に届いている、掲載中のお知らせ(新しい順)。deny by default:
 * 公開済み・掲載期間内で、宛先(全社・Audience・個人指定)に当てはまるものだけを返す。
 */
export async function listNoticesForActor(actor: Actor): Promise<ViewerNotice[]> {
  const today = actor.today;
  const rows = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.status, "published"),
        lte(announcements.publishedOn, today),
        or(isNull(announcements.expiresOn), gte(announcements.expiresOn, today)),
      ),
    )
    .orderBy(desc(announcements.publishedOn), desc(announcements.createdAt));
  if (rows.length === 0) return [];

  const employeeId = actor.employee?.id ?? null;
  const ids = rows.map((r) => r.id);
  const individualIds = rows.filter((r) => r.target === "individual").map((r) => r.id);
  const [matched, recipients, reads] = await Promise.all([
    matchedAudienceIds(
      employeeId,
      rows.flatMap((r) => (r.target === "audience" && r.audienceId ? [r.audienceId] : [])),
      today,
    ),
    employeeId && individualIds.length
      ? db
          .select({ announcementId: announcementRecipients.announcementId })
          .from(announcementRecipients)
          .where(
            and(
              eq(announcementRecipients.employeeId, employeeId),
              inArray(announcementRecipients.announcementId, individualIds),
            ),
          )
      : Promise.resolve([]),
    db
      .select()
      .from(announcementReads)
      .where(and(eq(announcementReads.userId, actor.userId), inArray(announcementReads.announcementId, ids))),
  ]);

  const myIndividual = new Set(recipients.map((r) => r.announcementId));
  const readById = new Map(reads.map((r) => [r.announcementId, r]));
  const viewer = { employeeId, matchedAudienceIds: matched };

  return rows
    .filter((r) =>
      isNoticeAddressedTo(r, viewer, myIndividual.has(r.id) && employeeId ? new Set([employeeId]) : new Set()),
    )
    .map((r) => toViewerNotice(r, readById.get(r.id), today));
}

function toViewerNotice(
  r: Announcement,
  read: { readAt: Date; acknowledgedAt: Date | null } | undefined,
  today: string,
): ViewerNotice {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    summary: summarize(r.body),
    kind: r.kind,
    priority: r.priority,
    target: r.target,
    publishedOn: r.publishedOn,
    expiresOn: r.expiresOn,
    isBanner: isNoticeBanner(r, today),
    bannerUntil: r.bannerUntil,
    requiresAction: r.requiresAction,
    isRead: read !== undefined,
    isAcknowledged: read?.acknowledgedAt != null,
  };
}

/** 見る人に届いている 1 件(届いていなければ null = 404)。 */
export async function getNoticeForActor(actor: Actor, id: string): Promise<ViewerNotice | null> {
  const list = await listNoticesForActor(actor);
  return list.find((n) => n.id === id) ?? null;
}

/** 既読を記録する(詳細を開いたとき。既に記録があれば何もしない)。宛先の判定は呼び出し側で済ませる。 */
export async function recordNoticeRead(actor: Actor, id: string): Promise<void> {
  await db
    .insert(announcementReads)
    .values({ announcementId: id, userId: actor.userId })
    .onConflictDoNothing();
}

// ---- 管理画面向け ----------------------------------------------------------------

export type AdminNoticeRow = Announcement & {
  audienceName: string | null;
  /** 宛先の人数(いまログインできる社員)。 */
  addresseeCount: number;
  readCount: number;
  acknowledgedCount: number;
};

export type AddresseeStatus = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  affiliation: string;
  hasAccount: boolean;
  readAt: Date | null;
  acknowledgedAt: Date | null;
};

/**
 * 宛先の社員(いまログインできる人)。company は全員、audience は Audience の評価(無効なら 0 人)、
 * individual は宛先のうちログインできる人。
 */
async function addresseesOf(
  notices: Pick<Announcement, "id" | "target" | "audienceId">[],
  today: string,
): Promise<{ map: Map<string, string[]>; info: Awaited<ReturnType<typeof loadPopulation>>["info"] }> {
  const population = await loadPopulation(today);
  const accessible = population.contexts.filter((c) => evaluateEmployeeAccess(c, today) === null);
  const definitions = await loadActiveDefinitions(
    notices.flatMap((n) => (n.target === "audience" && n.audienceId ? [n.audienceId] : [])),
  );
  const individualIds = notices.filter((n) => n.target === "individual").map((n) => n.id);
  const recipients = individualIds.length
    ? await db.select().from(announcementRecipients).where(inArray(announcementRecipients.announcementId, individualIds))
    : [];
  const accessibleIds = new Set(accessible.map((c) => c.employeeId));

  const map = new Map<string, string[]>();
  for (const n of notices) {
    if (n.target === "company") {
      map.set(n.id, accessible.map((c) => c.employeeId));
    } else if (n.target === "audience") {
      const def = n.audienceId ? definitions.get(n.audienceId) : undefined;
      map.set(n.id, def ? evaluateDefinition(def, population, today).map((e) => e.employeeId) : []);
    } else {
      map.set(
        n.id,
        recipients.filter((r) => r.announcementId === n.id && accessibleIds.has(r.employeeId)).map((r) => r.employeeId),
      );
    }
  }
  return { map, info: population.info };
}

/** 社員 → アカウント(既読はアカウント単位で記録しているため)。 */
async function userIdByEmployee(): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: users.id, employeeId: users.employeeId })
    .from(users)
    .where(sql`${users.employeeId} is not null`);
  return new Map(rows.map((r) => [r.employeeId!, r.id]));
}

/** 管理画面の一覧。includeIndividual が false なら、個人宛てのお知らせは含めない(権限 core.notices.individual)。 */
export async function listNoticesAdmin(today: string, includeIndividual: boolean): Promise<AdminNoticeRow[]> {
  const rows = await db
    .select({ notice: announcements, audienceName: audiences.name })
    .from(announcements)
    .leftJoin(audiences, eq(announcements.audienceId, audiences.id))
    .where(includeIndividual ? undefined : sql`${announcements.target} <> 'individual'`)
    .orderBy(desc(announcements.publishedOn), desc(announcements.createdAt));
  if (rows.length === 0) return [];

  const [{ map }, userByEmployee, reads] = await Promise.all([
    addresseesOf(rows.map((r) => r.notice), today),
    userIdByEmployee(),
    db.select().from(announcementReads).where(inArray(announcementReads.announcementId, rows.map((r) => r.notice.id))),
  ]);
  return rows.map(({ notice, audienceName }) => {
    const addressees = map.get(notice.id) ?? [];
    const readers = new Map(
      reads.filter((r) => r.announcementId === notice.id).map((r) => [r.userId, r]),
    );
    const states = addressees.map((e) => readers.get(userByEmployee.get(e) ?? ""));
    return {
      ...notice,
      audienceName,
      addresseeCount: addressees.length,
      readCount: states.filter(Boolean).length,
      acknowledgedCount: states.filter((s) => s?.acknowledgedAt).length,
    };
  });
}

export type AdminNoticeDetail = {
  notice: Announcement;
  audienceName: string | null;
  recipientIds: string[];
  addressees: AddresseeStatus[];
};

export async function getNoticeAdmin(id: string, today: string): Promise<AdminNoticeDetail | null> {
  const [row] = await db
    .select({ notice: announcements, audienceName: audiences.name })
    .from(announcements)
    .leftJoin(audiences, eq(announcements.audienceId, audiences.id))
    .where(eq(announcements.id, id));
  if (!row) return null;

  const [recipients, { map, info }, userByEmployee, reads] = await Promise.all([
    db
      .select({ employeeId: announcementRecipients.employeeId })
      .from(announcementRecipients)
      .where(eq(announcementRecipients.announcementId, id)),
    addresseesOf([row.notice], today),
    userIdByEmployee(),
    db.select().from(announcementReads).where(eq(announcementReads.announcementId, id)),
  ]);
  const readByUser = new Map(reads.map((r) => [r.userId, r]));
  const addressees = (map.get(id) ?? []).map((employeeId): AddresseeStatus => {
    const userId = userByEmployee.get(employeeId);
    const read = userId ? readByUser.get(userId) : undefined;
    const i = info.get(employeeId)!;
    return {
      employeeId,
      employeeNumber: i.employeeNumber,
      name: i.name,
      affiliation: i.affiliation,
      hasAccount: userId !== undefined,
      readAt: read?.readAt ?? null,
      acknowledgedAt: read?.acknowledgedAt ?? null,
    };
  });
  return {
    notice: row.notice,
    audienceName: row.audienceName,
    recipientIds: recipients.map((r) => r.employeeId),
    addressees,
  };
}

// ---- 添付ファイル ----------------------------------------------------------------

export type NoticeAttachment = { id: string; fileName: string; contentType: string; size: number };

/** お知らせの添付(並び順)。見てよいかの判定は呼び出し側で済ませる。 */
export async function listNoticeAttachments(announcementId: string): Promise<NoticeAttachment[]> {
  return db
    .select({
      id: announcementAttachments.id,
      fileName: announcementAttachments.fileName,
      contentType: announcementAttachments.contentType,
      size: announcementAttachments.size,
    })
    .from(announcementAttachments)
    .where(eq(announcementAttachments.announcementId, announcementId))
    .orderBy(asc(announcementAttachments.sortOrder), asc(announcementAttachments.createdAt));
}

/** お知らせごとの添付の数(一覧の印用)。 */
export async function countNoticeAttachments(announcementIds: string[]): Promise<Map<string, number>> {
  if (announcementIds.length === 0) return new Map();
  const rows = await db
    .select({ id: announcementAttachments.announcementId, n: count() })
    .from(announcementAttachments)
    .where(inArray(announcementAttachments.announcementId, announcementIds))
    .groupBy(announcementAttachments.announcementId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** 添付 1 つと、そのお知らせの宛先の種類(ファイルの入口で、見てよいかを判定するため)。 */
export async function findNoticeAttachment(id: string) {
  const [row] = await db
    .select({ attachment: announcementAttachments, target: announcements.target })
    .from(announcementAttachments)
    .innerJoin(announcements, eq(announcementAttachments.announcementId, announcements.id))
    .where(eq(announcementAttachments.id, id));
  return row ?? null;
}
