import Link from "next/link";
import { formatDateDot } from "../../../shared/format";
import { NOTICE_KIND_LABEL } from "../../notices";
import type { Notice } from "../../types";
import { Icon } from "../icons";
import { SectionHeading } from "../section-heading";

const LINK_CLASS = "text-brand01 hover:text-brand03 font-bold transition-colors";

/** あなたへのお知らせ(個人宛・全社宛の、未読と要対応)。ホームを、お知らせの入口にする。 */
export function PersonalNotices({
  notices,
  hiddenCount,
  actionRequiredCount,
}: {
  notices: Notice[];
  hiddenCount: number;
  actionRequiredCount: number;
}) {
  return (
    <section aria-labelledby="personal-notices-heading">
      <SectionHeading
        id="personal-notices-heading"
        en="FOR YOU"
        ja="あなたへのお知らせ"
        aside={
          <span className="flex items-center gap-3">
            {actionRequiredCount > 0 ? (
              <span className="bg-brand03 px-2 text-xs leading-6 font-bold text-white">
                要対応 {actionRequiredCount}件
              </span>
            ) : null}
            <Link href="/notices/personal" className={LINK_CLASS}>
              個人の一覧
            </Link>
            <Link href="/notices/company" className={LINK_CLASS}>
              全社の一覧
            </Link>
          </span>
        }
      />

      {notices.length === 0 ? (
        <p className="border-brand01/15 text-brand04 mt-4 border-y py-8 text-center text-sm">
          対応が必要なお知らせ・未読のお知らせはありません。
        </p>
      ) : (
        <ul className="mt-4">
          {notices.map((notice) => (
            <li key={notice.id} className="border-brand04/40 border-b first:border-t">
              <Link href={notice.href} className="group flex items-start gap-3 py-3.5 md:gap-5">
                <time
                  dateTime={notice.publishedOn}
                  className="font-heading text-brand04 w-[5.5rem] shrink-0 pt-0.5 text-sm tracking-[0.05em] md:w-24"
                >
                  {formatDateDot(notice.publishedOn)}
                </time>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {notice.target === "company" ? (
                      <span className="border-brand01 text-brand01 border px-1.5 text-xs leading-[1.125rem] font-bold">
                        全社
                      </span>
                    ) : null}
                    {notice.priority !== "normal" ? (
                      <span className="bg-brand03/15 text-brand03 px-1.5 text-xs leading-5 font-bold">
                        {notice.priority === "urgent" ? "緊急" : "重要"}
                      </span>
                    ) : null}
                    {notice.requiresAction ? (
                      <span className="bg-brand03 px-1.5 text-xs leading-5 font-bold text-white">
                        要対応
                      </span>
                    ) : null}
                    <span className="bg-field text-brand04 px-1.5 text-xs leading-5">
                      {NOTICE_KIND_LABEL[notice.kind]}
                    </span>
                    {!notice.isRead ? (
                      <span className="text-link flex items-center gap-1 text-xs font-bold">
                        <span aria-hidden="true" className="bg-link size-1.5 rounded-full" />
                        未読
                      </span>
                    ) : null}
                  </p>
                  <p className="text-brand01 group-hover:text-brand03 mt-1 font-bold transition-colors">
                    {notice.title}
                  </p>
                  <p className="text-brand04 mt-0.5 line-clamp-1 text-sm">{notice.summary}</p>
                </div>
                <Icon
                  name="chevron-right"
                  size={18}
                  className="text-brand04 group-hover:text-brand03 mt-1 shrink-0 transition-colors"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hiddenCount > 0 ? (
        <p className="text-brand04 mt-3 text-right text-sm">
          ほかに {hiddenCount} 件あります(個人・全社の一覧で見られます)
        </p>
      ) : null}
    </section>
  );
}
