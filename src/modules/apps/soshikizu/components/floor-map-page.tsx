import { canGlobally } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { lineWorksConfig } from "@/modules/core/lineworks";
import { applySeatOverrides, FLOOR_MAP_AS_OF, FLOOR_SEATS, placeSeats } from "../floor-map";
import { manifest } from "../manifest";
import { listOrgMembers, listSeatOverrides } from "../queries";
import type { OrgMember } from "../types";
import { FloorMap, type MapPerson, type MapSeat } from "./floor-map";
import { OrgTabs } from "./org-tabs";

const toPerson = (m: OrgMember): MapPerson => ({
  id: m.employeeId,
  name: m.name,
  nameKana: m.nameKana,
  positionName: m.positionName,
});

/**
 * 配置図(組織図アプリのタブ)。建物と「よくいる場所」は floor-map.ts、人は今日の在籍者から当てる。
 * 名簿の名前を押すと地図の上でその人の場所が光り、地図の建物を押すとそこにいる人が光る。docs/DESIGN.md 36 章。
 */
export async function FloorMapPage() {
  const actor = await requireAppAccess(manifest.appKey);
  const [members, overrides] = await Promise.all([listOrgMembers(actor.today), listSeatOverrides()]);
  // 管理者が動かした札は、コードの場所より優先する。
  const { seats, unplaced } = applySeatOverrides(placeSeats(FLOOR_SEATS, members), overrides);
  // 当て方(who)は画面に要らないので渡さない。
  const mapSeats: MapSeat[] = seats.map((s) => ({
    index: s.index,
    area: s.area,
    at: s.at,
    label: s.label,
    yomi: s.yomi,
    role: s.role,
    member: s.member ? toPerson(s.member) : null,
    moved: s.moved,
  }));
  const [y, mo, d] = FLOOR_MAP_AS_OF.split("-").map(Number);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <div>
        <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
          ORGANIZATION<span className="text-brand04 ml-3 font-medium tracking-[0.1em]">組織図</span>
        </p>
        <h1 className="text-brand01 mt-2 text-2xl font-bold">配置図</h1>
        <p className="text-brand04 mt-1 text-sm">
          だれが、どの建物のどのあたりにいるかの図です({y}年{mo}月{d}日 現在)。名簿の名前を押すと地図の上でその人が光り、地図の建物を押すとそこにいる人がみんな光ります。
        </p>
      </div>

      <OrgTabs current="map" />

      <FloorMap
        seats={mapSeats}
        unplaced={unplaced.map(toPerson)}
        myId={actor.employee?.id ?? null}
        withPhoto={lineWorksConfig() !== null}
        editAll={canGlobally(actor, "core.employees.manage")}
      />
    </div>
  );
}
