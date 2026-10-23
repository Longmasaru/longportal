import Link from "next/link";
import { canGlobally } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { lineWorksConfig } from "@/modules/core/lineworks";
import { buildOrgChart } from "../logic";
import { manifest } from "../manifest";
import { listDepartments, listLocations, listOrgMembers } from "../queries";
import { OrgBoard, type BoardOptions } from "./org-board";
import { OrgTabs } from "./org-tabs";

const FILTER_LINK = "border px-3 py-1.5 text-sm font-bold transition-colors";
const FILTER_ON = "border-brand01 bg-brand01 text-white";
const FILTER_OFF = "border-brand01/20 text-brand01 hover:border-brand03 hover:text-brand03 bg-white";

/**
 * 組織図(第 1 弾: 部署ごとの箱)。今日の主所属から作るので、異動は所属の画面で直せばそのまま反映される。
 * 社員管理の権限を全社で持つ人は、札をドラッグして異動できる(core/employees の moveEmployeeDepartmentAction)。
 * アプリ管理で有効にし、表示する相手に当てはまる人だけ(それ以外は 404)。docs/DESIGN.md 36 章。
 */
export async function OrgChartPage({ location }: { location: string | null }) {
  const actor = await requireAppAccess(manifest.appKey);

  const [members, departments, locations] = await Promise.all([
    listOrgMembers(actor.today),
    listDepartments(),
    listLocations(),
  ]);
  const selected = locations.find((l) => l.code === location) ?? null;
  // 所属を変えられる人(社員管理の権限を全社で持つ人)には、ドラッグで異動できる形で出す。
  const canEdit = canGlobally(actor, "core.employees.manage");
  const { executives, boxes } = buildOrgChart(members, departments, selected?.id ?? null);
  const total = executives.length + boxes.reduce((n, b) => n + b.count, 0);
  const opts: BoardOptions = {
    myId: actor.employee?.id ?? null,
    showLocation: !selected,
    // 顔写真は LINE WORKS のアイコン。連携の設定がない環境(手元の開発など)では、名字の 1 文字を出す。
    withPhoto: lineWorksConfig() !== null,
    canEdit,
    today: actor.today,
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <div>
        <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
          ORGANIZATION<span className="text-brand04 ml-3 font-medium tracking-[0.1em]">組織図</span>
        </p>
        <h1 className="text-brand01 mt-2 text-2xl font-bold">組織図</h1>
        <p className="text-brand04 mt-1 text-sm">
          一番上が経営、その下は部署ごとに、今日の所属の人を役職の順に並べています。名前を押すと、くわしく見られます。
          {opts.withPhoto && "吹き出しを押すと、その人と LINE WORKS でトークできます。"}
        </p>
      </div>

      <OrgTabs current="chart" />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-brand04 mr-1 text-xs font-bold tracking-widest">拠点</span>
        <Link href="/apps/soshikizu" className={`${FILTER_LINK} ${selected ? FILTER_OFF : FILTER_ON}`}>
          すべて
        </Link>
        {locations.map((l) => (
          <Link
            key={l.id}
            href={`/apps/soshikizu?location=${encodeURIComponent(l.code)}`}
            className={`${FILTER_LINK} ${selected?.id === l.id ? FILTER_ON : FILTER_OFF}`}
          >
            {l.name}
          </Link>
        ))}
        <span className="text-brand04 ml-auto text-sm">
          {selected ? `${selected.name}: ` : "全社: "}
          <span className="text-brand01 font-bold">{total}</span>人
        </span>
      </div>

      {total === 0 ? (
        <p className="text-brand04 border-brand01/15 border bg-white p-6 text-sm">この拠点には、まだだれもいません。</p>
      ) : (
        <OrgBoard executives={executives} boxes={boxes} opts={opts} departments={departments} />
      )}
    </div>
  );
}
