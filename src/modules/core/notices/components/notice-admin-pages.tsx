import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { canGlobally, requireGlobalPermission, type Actor } from "../../access";
import { evaluateEmployeeAccess } from "../../access/evaluate";
import { listAudiences, loadPopulation } from "../../audience";
import { formatDateDot } from "../../shared/format";
import { todayJst } from "../../shared/jst";
import { BUTTON_PRIMARY, FormNotice, LINK_CLASS, PageHeading, StatusTag } from "../../shared/ui/form";
import { NOTICE_KIND_LABEL, NOTICE_PRIORITY_LABEL, NOTICE_TARGET_LABEL } from "../labels";
import { isNoticeLive } from "../logic";
import { getNoticeAdmin, listNoticesAdmin } from "../queries";
import { NoticeAdminButtons } from "./notice-admin-buttons";
import { NoticeForm, type RecipientOption } from "./notice-form";

const PAGE_CLASS = "mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10";

function StateTag({ status, publishedOn, expiresOn, today }: {
  status: "draft" | "published";
  publishedOn: string;
  expiresOn: string | null;
  today: string;
}) {
  if (status === "draft") return <StatusTag tone="muted">下書き</StatusTag>;
  if (isNoticeLive({ status, publishedOn, expiresOn }, today)) return <StatusTag tone="info">掲載中</StatusTag>;
  if (publishedOn > today) return <StatusTag tone="neutral">掲載予定</StatusTag>;
  return <StatusTag tone="muted">掲載終了</StatusTag>;
}

/** 個人宛てのお知らせを扱えるか(作成・閲覧・既読の状況)。持たない人には、個人宛ては一覧にも出さない。 */
function canHandleIndividual(actor: Actor): boolean {
  return canGlobally(actor, "core.notices.individual");
}

async function formOptions(today: string, allowIndividual: boolean) {
  const [audiences, population] = await Promise.all([
    listAudiences(),
    allowIndividual ? loadPopulation(today) : Promise.resolve(null),
  ]);
  const employees: RecipientOption[] = (population?.contexts ?? [])
    .filter((c) => evaluateEmployeeAccess(c, today) === null)
    .map((c) => {
      const i = population!.info.get(c.employeeId)!;
      return { id: c.employeeId, employeeNumber: i.employeeNumber, name: i.name, affiliation: i.affiliation };
    });
  return { audiences: audiences.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name })), employees };
}

export async function AdminNoticesPage() {
  const actor = await requireGlobalPermission("core.notices.manage");
  const today = todayJst();
  const allowIndividual = canHandleIndividual(actor);
  const rows = await listNoticesAdmin(today, allowIndividual);

  return (
    <div className={PAGE_CLASS}>
      <PageHeading
        title="お知らせ管理"
        description={
          allowIndividual
            ? "お知らせを作成・公開します。宛先(全社・Audience・個人指定)に当てはまる社員にだけ表示されます。"
            : "お知らせを作成・公開します。宛先(全社・Audience)に当てはまる社員にだけ表示されます。個人宛てのお知らせは、ここには出ません。"
        }
        aside={
          <Link href="/admin/notices/new" className={`${BUTTON_PRIMARY} inline-block`}>
            お知らせを作成
          </Link>
        }
      />
      <section aria-label="お知らせの一覧">
        <p className="text-brand04 mb-2 text-sm">{rows.length}件</p>
        {rows.length === 0 ? (
          <p className="border-brand01/15 text-brand04 border-y py-10 text-center text-sm">
            まだお知らせがありません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="border-brand01 text-brand01 border-b-2 text-xs">
                  <th className="px-2 py-2 font-bold">お知らせ</th>
                  <th className="px-2 py-2 font-bold">宛先</th>
                  <th className="px-2 py-2 font-bold">掲載</th>
                  <th className="px-2 py-2 text-right font-bold">既読</th>
                  <th className="px-2 py-2 text-right font-bold">確認</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr key={n.id} className="border-brand04/40 border-b align-top">
                    <td className="px-2 py-3">
                      <p className="flex flex-wrap items-center gap-2">
                        <StateTag status={n.status} publishedOn={n.publishedOn} expiresOn={n.expiresOn} today={today} />
                        {n.priority !== "normal" ? (
                          <StatusTag tone="attention">{NOTICE_PRIORITY_LABEL[n.priority]}</StatusTag>
                        ) : null}
                        <span className="text-brand04 text-xs">{NOTICE_KIND_LABEL[n.kind]}</span>
                      </p>
                      <Link href={`/admin/notices/${n.id}`} className={`${LINK_CLASS} mt-1 block`}>
                        {n.title}
                      </Link>
                    </td>
                    <td className="text-brand01 px-2 py-3">
                      {n.target === "audience" ? (n.audienceName ?? "(削除された Audience)") : NOTICE_TARGET_LABEL[n.target]}
                      <span className="text-brand04 block text-xs">{n.addresseeCount}名</span>
                    </td>
                    <td className="text-brand04 px-2 py-3 text-xs">
                      {formatDateDot(n.publishedOn)} 〜 {n.expiresOn ? formatDateDot(n.expiresOn) : "無期限"}
                    </td>
                    <td className="text-brand01 px-2 py-3 text-right">
                      {n.readCount} / {n.addresseeCount}
                    </td>
                    <td className="text-brand01 px-2 py-3 text-right">
                      {n.requiresAction ? `${n.acknowledgedCount} / ${n.addresseeCount}` : <span className="text-brand04">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export async function AdminNoticeNewPage() {
  const actor = await requireGlobalPermission("core.notices.manage");
  const today = todayJst();
  const allowIndividual = canHandleIndividual(actor);
  const options = await formOptions(today, allowIndividual);
  return (
    <div className={PAGE_CLASS}>
      <PageHeading
        title="お知らせを作成"
        aside={
          <Link href="/admin/notices" className={LINK_CLASS}>
            一覧へ戻る
          </Link>
        }
      />
      <NoticeForm
        audiences={options.audiences}
        employees={options.employees}
        today={today}
        allowIndividual={allowIndividual}
      />
    </div>
  );
}

const SAVED_MESSAGE: Record<string, string> = {
  published: "公開しました。宛先の社員に表示されます(掲載開始日から)。",
  draft: "下書きとして保存しました。社員からは見えません。",
};

export async function AdminNoticeEditPage({ id, saved }: { id: string; saved?: string }) {
  const actor = await requireGlobalPermission("core.notices.manage");
  if (!z.uuid().safeParse(id).success) notFound();
  const today = todayJst();
  const allowIndividual = canHandleIndividual(actor);
  const [detail, options] = await Promise.all([getNoticeAdmin(id, today), formOptions(today, allowIndividual)]);
  // 個人宛ては、権限のない人には「ない」ものとして扱う(中身も既読の状況も見せない)。
  if (!detail || (detail.notice.target === "individual" && !allowIndividual)) notFound();
  const { notice, addressees } = detail;
  const read = addressees.filter((a) => a.readAt).length;
  const acknowledged = addressees.filter((a) => a.acknowledgedAt).length;
  // 編集中のお知らせが、いま無効な Audience を使っていても、選択肢に残す。
  const audienceOptions =
    notice.audienceId && !options.audiences.some((a) => a.id === notice.audienceId)
      ? [...options.audiences, { id: notice.audienceId, name: `${detail.audienceName ?? "削除された Audience"}(無効)` }]
      : options.audiences;
  const fmt = (d: Date | null) =>
    d ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(d) : "—";

  return (
    <div className={PAGE_CLASS}>
      <PageHeading
        title={notice.title}
        description={`宛先 ${addressees.length}名 ・ 既読 ${read}名${notice.requiresAction ? ` ・ 確認済み ${acknowledged}名` : ""}`}
        aside={
          <Link href="/admin/notices" className={LINK_CLASS}>
            一覧へ戻る
          </Link>
        }
      />
      {saved && SAVED_MESSAGE[saved] ? <FormNotice tone="success">{SAVED_MESSAGE[saved]}</FormNotice> : null}
      <div className="flex flex-wrap items-center gap-3">
        <StateTag status={notice.status} publishedOn={notice.publishedOn} expiresOn={notice.expiresOn} today={today} />
        <NoticeAdminButtons id={notice.id} status={notice.status} />
      </div>

      <NoticeForm
        notice={{
          id: notice.id,
          title: notice.title,
          body: notice.body,
          kind: notice.kind,
          priority: notice.priority,
          target: notice.target,
          audienceId: notice.audienceId,
          requiresAction: notice.requiresAction,
          publishedOn: notice.publishedOn,
          expiresOn: notice.expiresOn,
          bannerUntil: notice.bannerUntil,
          recipientIds: detail.recipientIds,
          status: notice.status,
        }}
        audiences={audienceOptions}
        employees={options.employees}
        today={today}
        allowIndividual={allowIndividual}
      />

      <section aria-labelledby="addressees-heading">
        <h2 id="addressees-heading" className="text-brand01 border-brand01/20 border-b pb-2 text-lg font-bold">
          既読・確認の状況
        </h2>
        <p className="text-brand04 mt-2 text-xs">
          宛先は、いまログインできる社員です(Audience は、今日の所属で判定)。アカウントのない社員は、まだ読めません。
        </p>
        {addressees.length === 0 ? (
          <p className="border-brand01/15 text-brand04 mt-3 border-y py-8 text-center text-sm">宛先の社員がいません。</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-brand01 text-brand01 border-b-2 text-xs">
                  <th className="px-2 py-2 font-bold">社員</th>
                  <th className="px-2 py-2 font-bold">所属</th>
                  <th className="px-2 py-2 font-bold">既読</th>
                  {notice.requiresAction ? <th className="px-2 py-2 font-bold">確認</th> : null}
                </tr>
              </thead>
              <tbody>
                {[...addressees]
                  .sort((a, b) => Number(Boolean(a.acknowledgedAt ?? a.readAt)) - Number(Boolean(b.acknowledgedAt ?? b.readAt)))
                  .map((a) => (
                    <tr key={a.employeeId} className="border-brand04/40 border-b">
                      <td className="px-2 py-2">
                        <span className="text-brand01 font-bold">{a.name}</span>
                        <span className="font-heading text-brand04 ml-2 text-xs">{a.employeeNumber}</span>
                        {!a.hasAccount ? <span className="text-brand04 ml-2 text-xs">(アカウントなし)</span> : null}
                      </td>
                      <td className="text-brand04 px-2 py-2 text-xs">{a.affiliation}</td>
                      <td className="text-brand01 px-2 py-2 text-xs">{fmt(a.readAt)}</td>
                      {notice.requiresAction ? (
                        <td className="px-2 py-2 text-xs">
                          {a.acknowledgedAt ? (
                            <span className="text-brand01">{fmt(a.acknowledgedAt)}</span>
                          ) : (
                            <StatusTag tone="attention">未確認</StatusTag>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
