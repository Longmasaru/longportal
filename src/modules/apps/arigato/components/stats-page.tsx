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
export async function ArigatoStatsPage({ month: monthParam }: { month?: string }) {
  const actor = await requireAppAccess(manifest.appKey);
  if (!canGlobally(actor, "arigato.stats.view")) notFound();

  const current = actor.today.slice(0, 7);
  const month = monthParam && MONTH_PATTERN.test(monthParam) && monthParam <= current ? monthParam : current;
  const stats = await getMonthStats(month, actor.today);
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-col gap-2">
        <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">THANKS CARD</p>
        <h1 className="text-brand01 text-2xl font-black">ありがとうカードの集計</h1>
        <p className="text-brand04 text-sm">
          ありがとうを伝えた人を評価するための集計です。加点は送ったカード 1 枚につき 1 点で、同じ相手には 1 日 1 点までです。「本人にだけ」のカードも数え、取り消したカードは数えません。
        </p>
        <Link href="/apps/arigato" className="text-brand01 hover:text-brand03 self-start text-sm font-bold">
          ← カードに戻る
        </Link>
      </header>

      <nav aria-label="月の切り替え" className="flex items-center justify-between gap-3">
        <Link href={`/apps/arigato/stats?month=${prev}`} className="text-brand01 hover:text-brand03 text-sm font-bold">
          ← {monthLabel(prev)}
        </Link>
        <p className="text-brand01 text-lg font-black">{monthLabel(month)}</p>
        {month < current ? (
          <Link href={`/apps/arigato/stats?month=${next}`} className="text-brand01 hover:text-brand03 text-sm font-bold">
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

      <Block title="送った人の加点(1 枚 1 点・同じ相手は 1 日 1 点まで)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-brand04 border-brand01/15 border-b text-left text-xs">
                <th className="py-2 pr-3 font-bold">名前</th>
                <th className="py-2 pr-3 font-bold">部署</th>
                <th className="py-2 pr-3 text-right font-bold">送った枚数</th>
                <th className="py-2 text-right font-bold">加点</th>
              </tr>
            </thead>
            <tbody>
              {stats.senderPoints.map((r) => (
                <tr key={r.userId} className="border-brand01/10 border-b">
                  <td className="text-brand01 py-2 pr-3 font-bold whitespace-nowrap">{r.name}</td>
                  <td className="text-brand04 py-2 pr-3 whitespace-nowrap">{r.departmentName ?? "—"}</td>
                  <td className="text-brand04 py-2 pr-3 text-right tabular-nums">{r.cards}</td>
                  <td
                    className={`py-2 text-right font-bold tabular-nums ${r.points > 0 ? "text-brand01" : "text-brand04"}`}
                  >
                    {r.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>

      <Block title="どんなこと">
        <Bars rows={stats.byTag.map((r) => ({ label: ARIGATO_TAG_LABEL[r.tag], count: r.count }))} />
      </Block>
      <Block title="受け取った人の部署(送った時点)">
        <Bars rows={stats.byDepartment.map((r) => ({ label: r.name, count: r.count }))} />
      </Block>
      <Block title="受け取った枚数の多い人(上位 10 人・参考。加点はしません)">
        <Bars rows={stats.topReceivers.map((r) => ({ label: r.name, count: r.count }))} />
      </Block>
    </div>
  );
}
