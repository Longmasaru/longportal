"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type DragEvent } from "react";
import { moveEmployeeDepartmentAction } from "@/modules/core/employees/actions";
import type { OrgBox, OrgMember, OrgUnit } from "../types";
import { Avatar } from "./avatar";

export type BoardOptions = {
  myId: string | null;
  showLocation: boolean;
  withPhoto: boolean;
  /** 所属を変えられる人(core.employees.manage を全社で持つ人)だけ true。札をドラッグできる。 */
  canEdit: boolean;
  today: string;
};

type Move = { member: OrgMember; to: OrgUnit; from: string };

const DRAG_TYPE = "application/x-soshikizu-employee";

/** 1 人分の札。押すと役職・拠点・入社年が開く。管理者は別の箱へドラッグでき、開いた中の選択欄からも部署を変えられる(スマホ用)。 */
function MemberCard({
  m,
  fromName,
  opts,
  departments,
  onMove,
}: {
  m: OrgMember;
  fromName: string;
  opts: BoardOptions;
  departments: OrgUnit[];
  onMove: (move: Move) => void;
}) {
  const isMe = m.employeeId === opts.myId;
  // 主所属のない人は、部署だけを変えられない(拠点が決まらない)ので動かさない。
  const movable = opts.canEdit && m.departmentId !== null;
  return (
    <details
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, m.employeeId);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`border bg-white ${isMe ? "border-brand03" : "border-brand01/15"} ${movable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
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
      {movable && (
        <label className="border-brand01/10 text-brand04 flex items-center gap-2 border-t px-3 py-2 text-xs">
          <span className="font-bold">部署を変える</span>
          <select
            value=""
            onChange={(e) => {
              const to = departments.find((d) => d.id === e.target.value);
              if (to) onMove({ member: m, to, from: fromName });
            }}
            className="border-brand01/20 text-brand01 flex-1 border bg-white px-2 py-1"
          >
            <option value="">選ぶ…</option>
            {departments
              .filter((d) => d.id !== m.departmentId)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
      )}
    </details>
  );
}

function DepartmentBox({
  box,
  opts,
  departments,
  members,
  onMove,
}: {
  box: OrgBox;
  opts: BoardOptions;
  departments: OrgUnit[];
  members: Map<string, { member: OrgMember; from: string }>;
  onMove: (move: Move) => void;
}) {
  const [over, setOver] = useState(false);
  const dept = box.department;
  const name = dept?.name ?? "所属なし";
  // 落とせるのは部署の箱だけ(「所属なし」へは落とせない)。
  const droppable = opts.canEdit && dept !== null;
  const dropProps = droppable
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setOver(false);
          const hit = members.get(e.dataTransfer.getData(DRAG_TYPE));
          if (hit && hit.member.departmentId !== dept.id) onMove({ member: hit.member, to: dept, from: hit.from });
        },
      }
    : {};
  const card = (m: OrgMember) => (
    <li key={m.employeeId}>
      <MemberCard m={m} fromName={name} opts={opts} departments={departments} onMove={onMove} />
    </li>
  );
  return (
    <section
      {...dropProps}
      className={`flex flex-col border bg-white transition-colors ${over ? "border-brand03 ring-brand03 ring-2" : "border-brand01/15"}`}
    >
      <header className="bg-brand01 flex items-baseline justify-between px-4 py-2 text-white">
        <h2 className="font-bold">{name}</h2>
        <span className="text-xs">{box.count}人</span>
      </header>
      <div className="flex flex-col gap-3 p-3">
        {box.leaders.length > 0 && <ul className="flex flex-col gap-2">{box.leaders.map(card)}</ul>}
        {box.leaders.length > 0 && box.members.length > 0 && <hr className="border-brand01/10" />}
        {box.members.length > 0 && <ul className="flex flex-col gap-2">{box.members.map(card)}</ul>}
        {box.count === 0 && <p className="text-brand04 py-4 text-center text-xs">ここへドラッグすると、この部署へ異動できます</p>}
      </div>
    </section>
  );
}

/** 異動の確かめ。日付を選んで「異動する」を押したときだけ、所属を書き換える。 */
function MoveDialog({ move, today, onClose }: { move: Move; today: string; onClose: () => void }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await moveEmployeeDepartmentAction({
        employeeId: move.member.employeeId,
        departmentId: move.to.id,
        effectiveDate: date,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex w-full max-w-sm flex-col gap-4 bg-white p-6 shadow-lg">
        <h2 className="text-brand01 text-lg font-bold">所属を変えますか?</h2>
        <p className="text-brand01 text-sm">
          <span className="font-bold">{move.member.name}</span> さんを
          <br />
          {move.from} → <span className="font-bold">{move.to.name}</span>
          {move.member.locationName && <span className="text-brand04">(拠点は {move.member.locationName} のまま)</span>}
        </p>
        <label className="text-brand04 flex flex-col gap-1 text-xs font-bold">
          いつから
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border-brand01/20 text-brand01 border px-2 py-1.5 text-sm font-normal"
          />
        </label>
        <p className="text-brand04 text-xs">
          社員の所属(所属の割り当て画面と同じもの)が書き換わり、監査ログに残ります。
        </p>
        {error && <p className="text-sm font-bold text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="border-brand01/20 text-brand01 border bg-white px-4 py-2 text-sm font-bold"
          >
            やめる
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !date}
            className="bg-brand01 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {pending ? "変えています…" : "異動する"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrgBoard({ boxes, opts, departments }: { boxes: OrgBox[]; opts: BoardOptions; departments: OrgUnit[] }) {
  const [move, setMove] = useState<Move | null>(null);
  const members = new Map(
    boxes.flatMap((b) =>
      [...b.leaders, ...b.members].map((m) => [m.employeeId, { member: m, from: b.department?.name ?? "所属なし" }] as const),
    ),
  );
  return (
    <>
      {opts.canEdit && (
        <p className="text-brand04 -mt-4 text-xs">
          管理者の方は、札を別の部署の箱へドラッグすると異動できます(スマホは名前を押して「部署を変える」)。
        </p>
      )}
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {boxes.map((box) => (
          <DepartmentBox
            key={box.department?.id ?? "none"}
            box={box}
            opts={opts}
            departments={departments}
            members={members}
            onMove={setMove}
          />
        ))}
      </div>
      {move && <MoveDialog move={move} today={opts.today} onClose={() => setMove(null)} />}
    </>
  );
}
