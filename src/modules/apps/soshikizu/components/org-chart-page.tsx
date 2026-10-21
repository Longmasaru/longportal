import Link from "next/link";
import { requireAppAccess } from "@/modules/core/apps";
import { lineWorksConfig } from "@/modules/core/lineworks";
import { buildOrgBoxes } from "../logic";
import { manifest } from "../manifest";
import { listDepartments, listLocations, listOrgMembers } from "../queries";
import type { OrgBox, OrgMember } from "../types";
import { Avatar } from "./avatar";

const FILTER_LINK = "border px-3 py-1.5 text-sm font-bold transition-colors";
const FILTER_ON = "border-brand01 bg-brand01 text-white";
const FILTER_OFF = "border-brand01/20 text-brand01 hover:border-brand03 hover:text-brand03 bg-white";

/** 1 人分の札。押すと役職・拠点・入社年が開く(JS なしで動く details)。 */
type CardOptions = { myId: string | null; showLocation: boolean; withPhoto: boolean };

function MemberCard({ m, opts }: { m: OrgMember; opts: CardOptions }) {
  const isMe = m.employeeId === opts.myId;
  return (
    <details className={`border bg-white ${isMe ? "border-brand03" : "border-brand01/15"}`}>
      <summary className="hover:bg-brand01/5 flex cursor-pointer list-none items-center gap-3 px-3 py-2">
        <Avatar employeeId={m.employeeId} name={m.name} withPhoto={opts.withPhoto} />
        <span className="min-w-0 flex-1">
          <span className="text-brand01 font-bold">{m.name}</span>
          {isMe && <span className="text-brand03 ml-2 text-xs font-bold">あなた</span>}
          {m.nameKana && <span className="text-brand04 block truncate text-xs">{m.nameKana}</span>}
        </span>
        <span className="text-brand04 shrink-0 text-right text-xs">
          {m.positionName ?? ""}
          {opts.showLocation && m.locationName && <span className="block">{m.locationName}</span>}
        </span>
      </summary>
      <dl className="border-brand01/10 text-brand04 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t px-3 py-2 text-xs">
        <dt className="font-bold">役職</dt>
        <dd>{m.positionName ?? "なし"}</dd>
        <dt className="font-bold">拠点</dt>
        <dd>{m.locationName ?? "未設定"}</dd>
        <dt className="font-bold">入社</dt>
        <dd>{m.hiredOn.slice(0, 4)}年</dd>
      </dl>
    </details>
  );
}

function DepartmentBox({ box, opts }: { box: OrgBox; opts: CardOptions }) {
  return (
    <section className="border-brand01/15 flex flex-col border bg-white">
      <header className="bg-brand01 flex items-baseline justify-between px-4 py-2 text-white">
        <h2 className="font-bold">{box.department?.name ?? "所属なし"}</h2>
        <span className="text-xs">{box.count}人</span>
      </header>
      <div className="flex flex-col gap-3 p-3">
        {box.leaders.length > 0 && (
          <ul className="flex flex-col gap-2">
            {box.leaders.map((m) => (
              <li key={m.employeeId}>
                <MemberCard m={m} opts={opts} />
              </li>
            ))}
          </ul>
        )}
        {box.leaders.length > 0 && box.members.length > 0 && <hr className="border-brand01/10" />}
        {box.members.length > 0 && (
          <ul className="flex flex-col gap-2">
            {box.members.map((m) => (
              <li key={m.employeeId}>
                <MemberCard m={m} opts={opts} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * 組織図(第 1 弾: 部署ごとの箱)。今日の主所属から作るので、異動は所属の画面で直せばそのまま反映される。
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
  const boxes = buildOrgBoxes(members, departments, selected?.id ?? null);
  const total = boxes.reduce((n, b) => n + b.count, 0);
  // 顔写真は LINE WORKS のアイコン。連携の設定がない環境(手元の開発など)では、名字の 1 文字を出す。
  const opts: CardOptions = { myId: actor.employee?.id ?? null, showLocation: !selected, withPhoto: lineWorksConfig() !== null };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <div>
        <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
          ORGANIZATION<span className="text-brand04 ml-3 font-medium tracking-[0.1em]">組織図</span>
        </p>
        <h1 className="text-brand01 mt-2 text-2xl font-bold">組織図</h1>
        <p className="text-brand04 mt-1 text-sm">
          部署ごとに、今日の所属の人を役職の順に並べています。名前を押すと、くわしく見られます。
        </p>
      </div>

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

      {boxes.length === 0 ? (
        <p className="text-brand04 border-brand01/15 border bg-white p-6 text-sm">この拠点には、まだだれもいません。</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boxes.map((box) => (
            <DepartmentBox key={box.department?.id ?? "none"} box={box} opts={opts} />
          ))}
        </div>
      )}
    </div>
  );
}
