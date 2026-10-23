import Link from "next/link";
import { notFound } from "next/navigation";
import { LINK_CLASS, PageHeading } from "@/modules/core/shared/ui/form";
import { EXPIRY_WARN_DAYS, RESIDENCE_STATUS_LABEL } from "../constants";
import { managerOrNull } from "../guard";
import { displayName, expiryState, formatJapaneseDate, yearOrdinal } from "../logic";
import { listAddableEmployees, listNakamaMembers } from "../queries";
import { AddMemberForm } from "./member-forms";

const BASE = "/apps/nakama";

/** 名簿の管理(載せる人を足す・一覧から直す)。在留期限が近い人を上に知らせる。権限 nakama.members.manage(全社)。 */
export async function NakamaManagePage() {
  const actor = await managerOrNull();
  if (!actor) notFound();
  const [members, addable] = await Promise.all([listNakamaMembers(actor.today), listAddableEmployees(actor.today)]);
  const rows = members.map((m) => ({ m, expiry: expiryState(m.residenceExpiresOn, actor.today) }));
  const alerts = rows.filter((r) => r.expiry.state === "soon" || r.expiry.state === "expired");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="名簿を直す"
        description="ベトナムの仲間の名簿に載せる人を足し、呼び名・日本に来た日・在留資格などを入れます。"
        aside={
          <Link href={BASE} className={LINK_CLASS}>
            名簿に戻る
          </Link>
        }
      />

      {alerts.length > 0 ? (
        <div className="border-brand03 bg-brand03/10 text-brand01 border-l-4 px-4 py-3" role="status">
          <p className="font-bold">在留期限が {EXPIRY_WARN_DAYS} 日以内の人がいます</p>
          <ul className="mt-1 text-sm">
            {alerts.map(({ m, expiry }) => (
              <li key={m.employeeId}>
                <Link href={`${BASE}/manage/${m.employeeId}`} className={LINK_CLASS}>
                  {displayName(m)} さん
                </Link>
                : {formatJapaneseDate(m.residenceExpiresOn ?? "")}
                {expiry.state === "expired" ? "(過ぎています。更新したら日付を直してください)" : `(あと ${expiry.daysLeft} 日)`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-brand01 text-lg font-bold">名簿に足す</h2>
        <AddMemberForm
          options={addable.map((e) => ({
            employeeId: e.employeeId,
            label: `${e.employeeNumber} ${e.name}${e.nameKana ? `(${e.nameKana})` : ""}`,
          }))}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-brand01 text-lg font-bold">載っている人({members.length} 人)</h2>
        {members.length === 0 ? (
          <p className="text-brand04 text-sm">まだ、だれも載っていません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse bg-white text-sm">
              <thead>
                <tr className="text-brand04 border-brand01/15 border-b text-left text-xs">
                  <th className="px-3 py-2">呼び名・氏名</th>
                  <th className="px-3 py-2">部署</th>
                  <th className="px-3 py-2">在留資格</th>
                  <th className="px-3 py-2">日本に来て</th>
                  <th className="px-3 py-2">在留期限</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ m, expiry }) => {
                  const year = yearOrdinal(m.arrivedOn, actor.today);
                  return (
                    <tr key={m.employeeId} className="border-brand01/10 text-brand01 border-b">
                      <td className="px-3 py-2">
                        <Link href={`${BASE}/manage/${m.employeeId}`} className={LINK_CLASS}>
                          {displayName(m)}
                        </Link>
                        {m.nickname ? <span className="text-brand04 ml-2 text-xs">{m.name}</span> : null}
                      </td>
                      <td className="px-3 py-2">{m.departmentName ?? "所属なし"}</td>
                      <td className="px-3 py-2">{m.residenceStatus ? RESIDENCE_STATUS_LABEL[m.residenceStatus] : "—"}</td>
                      <td className="px-3 py-2">{year !== null ? `${year} 年目` : "—"}</td>
                      <td className={`px-3 py-2 ${expiry.state === "soon" || expiry.state === "expired" ? "text-brand03 font-bold" : ""}`}>
                        {m.residenceExpiresOn ? formatJapaneseDate(m.residenceExpiresOn) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-brand04 text-xs">
          載せられるのは在籍中の社員だけです。退職すると、名簿から自動で見えなくなります。氏名・フリガナ・部署は社員の管理の画面で直してください。
        </p>
      </section>
    </div>
  );
}
