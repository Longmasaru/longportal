import Link from "next/link";
import { NOTICE_KIND_LABEL } from "../../notices";
import type { Notice } from "../../types";
import { SectionHeading } from "../section-heading";
import { NoticeItem } from "./notice-item";

const LINK_CLASS = "text-brand01 hover:text-brand03 font-bold transition-colors";

/** あなたへのお知らせ(個人宛・全社宛の、未読と要対応)。ホームを、お知らせの入口にする。本文の先頭も見せる。 */
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
            <NoticeItem key={notice.id} notice={notice} kindLabel={NOTICE_KIND_LABEL[notice.kind]} />
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
