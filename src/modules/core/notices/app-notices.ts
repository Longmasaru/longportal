import { db } from "@/db/client";
import { addDays } from "../shared/date";
import { announcementRecipients, announcements, type NoticeKind, type NoticePriority } from "./schema";

/** アプリが自動で届けるお知らせの掲載日数(過ぎたら一覧から消える)。 */
export const APP_NOTICE_DAYS = 30;

/**
 * アプリから、特定の社員の「お知らせ → 個人」に 1 件届ける(docs/DESIGN.md 23 章・42 章)。
 * 作った人は空(システム)。本文は「お知らせ管理」でも見えるので、アプリの秘密の内容は入れず、
 * 詳しくはアプリの画面へのリンクで見せる。宛先が 0 人なら何もしない。
 */
export async function createAppNotice(input: {
  title: string;
  body: string;
  kind?: NoticeKind;
  priority?: NoticePriority;
  recipientEmployeeIds: string[];
  today: string;
}): Promise<void> {
  const recipients = [...new Set(input.recipientEmployeeIds)];
  if (recipients.length === 0) return;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(announcements)
      .values({
        title: input.title.slice(0, 100),
        body: input.body.slice(0, 5000),
        kind: input.kind ?? "general",
        priority: input.priority ?? "normal",
        target: "individual",
        status: "published",
        publishedOn: input.today,
        expiresOn: addDays(input.today, APP_NOTICE_DAYS),
      })
      .returning({ id: announcements.id });
    await tx
      .insert(announcementRecipients)
      .values(recipients.map((employeeId) => ({ announcementId: row.id, employeeId })));
  });
}
