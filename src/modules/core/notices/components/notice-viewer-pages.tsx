import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "../../access";
import { formatDateDot } from "../../shared/format";
import { LINK_CLASS, PageHeading, StatusTag } from "../../shared/ui/form";
import { NOTICE_KIND_LABEL, NOTICE_PRIORITY_LABEL } from "../labels";
import { getNoticeForActor, listNoticesForActor, recordNoticeRead, type ViewerNotice } from "../queries";
import { AcknowledgeButton } from "./acknowledge-button";

const PAGE_CLASS = "mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10";

/** 社員向けの画面の入口(初回のパスワード変更が済んでいない人は、変更画面へ)。 */
async function requireViewer() {
  const actor = await requireActor();
  if (actor.mustChangePassword) redirect("/password");
  return actor;
}

export type NoticeChannel = "personal" | "company";

const CHANNEL = {
  personal: {
    title: "個人のお知らせ",
    description: "あなた宛て(所属や個人指定)のお知らせです。",
    empty: "あなた宛てのお知らせはありません。",
  },
  company: {
    title: "重要・全社のお知らせ",
    description: "全社員宛てのお知らせです。",
    empty: "全社宛てのお知らせはありません。",
  },
} as const;

function NoticeTags({ n }: { n: ViewerNotice }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {n.requiresAction && !n.isAcknowledged ? <StatusTag tone="attention">要対応</StatusTag> : null}
      {n.priority !== "normal" ? <StatusTag tone="attention">{NOTICE_PRIORITY_LABEL[n.priority]}</StatusTag> : null}
      <StatusTag tone="neutral">{NOTICE_KIND_LABEL[n.kind]}</StatusTag>
      {!n.isRead ? (
        <span className="text-link flex items-center gap-1 text-xs font-bold">
          <span aria-hidden="true" className="bg-link size-1.5 rounded-full" />
          未読
        </span>
      ) : null}
    </span>
  );
}

/** お知らせの一覧(個人 / 重要・全社)。要対応 → 未読 → 新しい順。 */
export async function NoticeListPage({ channel }: { channel: NoticeChannel }) {
  const actor = await requireViewer();
  const all = await listNoticesForActor(actor);
  const list = all
    .filter((n) => (channel === "company" ? n.target === "company" : n.target !== "company"))
    .sort((a, b) => {
      const aAct = a.requiresAction && !a.isAcknowledged;
      const bAct = b.requiresAction && !b.isAcknowledged;
      if (aAct !== bAct) return aAct ? -1 : 1;
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      return b.publishedOn.localeCompare(a.publishedOn);
    });
  const c = CHANNEL[channel];

  return (
    <div className={PAGE_CLASS}>
      <PageHeading title={c.title} description={c.description} />
      {list.length === 0 ? (
        <p className="border-brand01/15 text-brand04 border-y py-10 text-center text-sm">{c.empty}</p>
      ) : (
        <ul>
          {list.map((n) => (
            <li key={n.id} className="border-brand04/40 border-b first:border-t">
              <Link href={`/notices/${n.id}`} className="group flex items-start gap-3 py-3.5 md:gap-5">
                <time
                  dateTime={n.publishedOn}
                  className="font-heading text-brand04 w-[5.5rem] shrink-0 pt-0.5 text-sm tracking-[0.05em] md:w-24"
                >
                  {formatDateDot(n.publishedOn)}
                </time>
                <div className="min-w-0 flex-1">
                  <NoticeTags n={n} />
                  <p className="text-brand01 group-hover:text-brand03 mt-1 font-bold transition-colors">{n.title}</p>
                  {n.summary ? <p className="text-brand04 mt-0.5 line-clamp-1 text-sm">{n.summary}</p> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** お知らせの詳細。届いていなければ 404。開いたら既読にする。 */
export async function NoticeDetailPage({ id }: { id: string }) {
  const actor = await requireViewer();
  if (!z.uuid().safeParse(id).success) notFound();
  const notice = await getNoticeForActor(actor, id);
  if (!notice) notFound();
  if (!notice.isRead) await recordNoticeRead(actor, notice.id);
  const back = notice.target === "company" ? "/notices/company" : "/notices/personal";

  return (
    <div className={PAGE_CLASS}>
      <div>
        <NoticeTags n={{ ...notice, isRead: true }} />
        <h1 className="text-brand01 mt-2 text-2xl font-bold">{notice.title}</h1>
        <p className="font-heading text-brand04 mt-1 text-sm tracking-[0.05em]">
          {formatDateDot(notice.publishedOn)}
          {notice.expiresOn ? ` 〜 ${formatDateDot(notice.expiresOn)}` : ""}
        </p>
      </div>
      {notice.requiresAction ? <AcknowledgeButton id={notice.id} acknowledged={notice.isAcknowledged} /> : null}
      {notice.body ? (
        <div className="border-brand01/15 text-brand01 border-y py-6 leading-relaxed whitespace-pre-wrap">
          {notice.body}
        </div>
      ) : null}
      <p className="text-sm">
        <Link href={back} className={LINK_CLASS}>
          一覧へ戻る
        </Link>
      </p>
    </div>
  );
}
