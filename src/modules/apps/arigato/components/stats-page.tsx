import Link from "next/link";
import { notFound } from "next/navigation";
import { canGlobally } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { ARIGATO_TAG_LABEL, shiftMonth } from "../constants";
import { manifest } from "../manifest";
import { getMonthStats } from "../queries";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

function Bars({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="text-brand04 text-sm">この月のカードはありません。</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="text-brand01 truncate font-bold">{r.label}</span>
          <span className="bg-bg01 h-3">
            <span className="bg-brand01 block h-full" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="text-brand01 text-right tabular-nums">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-brand01/15 flex flex-col gap-3 border-t pt-4">
      <h2 className="text-brand01 font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** 集計(権限 arigato.stats.view を全社で持つ人だけ。それ以外は 404)。 */
export async function ArigatoStatsPage({ month: monthParam, dept }: { month?: string; dept?: string }) {
  const actor = await requireAppAccess(manifest.appKey);
  if (!canGlobally(actor, "arigato.stats.view")) notFound();

  const current = actor.today.slice(0, 7);
  const month = monthParam && MONTH_PATTERN.test(monthParam) && monthParam <= current ? monthParam : current;
  const stats = await getMonthStats(month, actor.today);
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const deptNames = [...new Set(stats.senderPoints.map((r) => r.departmentName ?? "未配属"))].sort((a, b) =>
    a.localeCompare(b, "ja"),
  );
  const selectedDept = dept && deptNames.includes(dept) ? dept : undefined;
  const rows = selectedDept
    ? stats.senderPoints.filter((r) => (r.departmentName ?? "未配属") === selectedDept)
    : stats.senderPoints;
  const hrefOf = (m: string, d?: string) =>
    `/apps/arigato/stats?month=${m}${d ? `&dept=${encodeURIComponent(d)}` : ""}`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-col gap-2">
        <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">THANKS CARD</p>
        <h1 className="text-brand01 text-2xl font-black">ありがとうカードの集計</h1>
        <p className="text-brand04 text-sm">
          ありがとうが社内に増え、「育てて、育つ。」が進んでいるかを見るための集計です。伝えた点は、送ったカード 1 枚につき 1
          点(同じ相手には 1 日 1 点まで)。もらった点は、もらったカード 1 枚につき 1 点(同じ人からは 1 日 1 点・月 4
          点まで)で、自分が伝えた点と同じ数まで数えます。点がないことを減点にはしません。「本人にだけ」のカードも数え、取り消したカードは数えません。
        </p>
        <Link href="/apps/arigato" className="text-brand01 hover:text-brand03 self-start text-sm font-bold">
          ← カードに戻る
        </Link>
      </header>

      <nav aria-label="月の切り替え" className="flex items-center justify-between gap-3">
        <Link href={hrefOf(prev, selectedDept)} className="text-brand01 hover:text-brand03 text-sm font-bold">
          ← {monthLabel(prev)}
        </Link>
        <p className="text-brand01 text-lg font-black">{monthLabel(month)}</p>
        {month < current ? (
          <Link href={hrefOf(next, selectedDept)} className="text-brand01 hover:text-brand03 text-sm font-bold">
            {monthLabel(next)} →
          </Link>
        ) : (
          <span className="w-16" />
        )}
      </nav>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bg01 px-4 py-3">
          <p className="text-brand04 text-xs font-bold">送られたカード</p>
          <p className="font-heading text-brand01 text-3xl font-bold tabular-nums">{stats.total}</p>
        </div>
        <div className="bg-bg01 px-4 py-3">
          <p className="text-brand04 text-xs font-bold">送った人</p>
          <p className="font-heading text-brand01 text-3xl font-bold tabular-nums">{stats.senders}</p>
        </div>
      </div>

      <Block title="一人ひとりの点(伝えた点の多い順)">
        <nav aria-label="部署の絞り込み" className="flex flex-wrap gap-2 text-xs">
          {[undefined, ...deptNames].map((d) => (
            <Link
              key={d ?? "all"}
              href={hrefOf(month, d)}
              aria-current={d === selectedDept ? "page" : undefined}
              className={`border px-2.5 py-1 font-bold ${
                d === selectedDept
                  ? "bg-brand01 border-brand01 text-white"
                  : "border-brand01/30 text-brand01 hover:border-brand01"
              }`}
            >
              {d ?? "全社"}
            </Link>
          ))}
        </nav>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-brand04 border-brand01/15 border-b text-left text-xs">
                <th className="py-2 pr-3 font-bold">名前</th>
                <th className="py-2 pr-3 font-bold">部署</th>
                <th className="py-2 pr-3 text-right font-bold whitespace-nowrap">送った枚数</th>
                <th className="py-2 pr-3 text-right font-bold whitespace-nowrap">伝えた点</th>
                <th className="py-2 text-right font-bold whitespace-nowrap">もらった点</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-brand01/10 border-b">
                  <td className="text-brand01 py-2 pr-3 font-bold whitespace-nowrap">{r.name}</td>
                  <td className="text-brand04 py-2 pr-3 whitespace-nowrap">{r.departmentName ?? "—"}</td>
                  <td className="text-brand04 py-2 pr-3 text-right tabular-nums">{r.cards}</td>
                  <td
                    className={`py-2 pr-3 text-right font-bold tabular-nums ${r.points > 0 ? "text-brand01" : "text-brand04"}`}
                  >
                    {r.points}
                  </td>
                  <td
                    className={`py-2 text-right font-bold whitespace-nowrap tabular-nums ${r.received > 0 ? "text-brand01" : "text-brand04"}`}
                  >
                    {r.received}
                    {r.receivedRaw > r.received ? (
                      <span className="text-brand04 ml-1 text-xs font-normal">(もらった {r.receivedRaw})</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-brand04 text-xs">
          (もらった N)は、伝えた点を超えてもらっている分も含めた数です。もらった点には入りませんが、周りから感謝されていることの参考になります。
        </p>
      </Block>

      <Block title="どんなこと">
        <Bars rows={stats.byTag.map((r) => ({ label: ARIGATO_TAG_LABEL[r.tag], count: r.count }))} />
      </Block>
      <Block title="受け取った人の部署(送った時点)">
        <Bars rows={stats.byDepartment.map((r) => ({ label: r.name, count: r.count }))} />
      </Block>
      <Block title="受け取った枚数の多い人(上位 10 人・参考)">
        <Bars rows={stats.topReceivers.map((r) => ({ label: r.name, count: r.count }))} />
      </Block>
    </div>
  );
}
