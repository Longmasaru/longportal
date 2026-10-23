"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent } from "react";
import { moveSeatAction, resetSeatAction } from "../actions";
import {
  FLOOR_AREAS,
  areaAt,
  FLOOR_DOORS,
  FLOOR_MACHINES,
  FLOOR_MAP_SIZE,
  FLOOR_MARKS,
  FLOOR_SEATS,
  FLOOR_TRUCK,
  FLOOR_WCS,
  type AreaKey,
  type FloorSeat,
} from "../floor-map";
import { canMoveSeat } from "../logic";
import { Avatar } from "./avatar";
import { TalkLink } from "./talk-link";

/** 画面に渡す社員(必要なものだけ)。 */
export type MapPerson = { id: string; name: string; nameKana: string | null; positionName: string | null };
/** moved: 管理者が動かした札(元の場所に戻せる)。 */
export type MapSeat = Omit<FloorSeat, "who"> & { index: number; member: MapPerson | null; moved: boolean };

type Point = { x: number; y: number };
type Drag = { index: number; employeeId: string; start: Point; pos: Point; moved: boolean };

type Selection = { kind: "seat"; index: number } | { kind: "area"; key: AreaKey } | null;

const AREA_NAME = new Map(FLOOR_AREAS.map((a) => [a.key, a.name]));
const ROLE_COLOR = { lead: "#c0392b", sub: "#2c6fb3" } as const;

/** 文字の幅のおおよそ(mm)。英数字は細く、かな・漢字は 1 文字ぶん。 */
function textWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += /[\x20-\x7e]/.test(ch) ? size * 0.66 : size;
  return w;
}

/** 札の大きさ。ふりがな・名前・(役目)の 3 段。 */
function seatBox(s: MapSeat) {
  const w = Math.max(textWidth(s.label, 3.7), textWidth(s.yomi, 2.2), s.role ? textWidth(s.role.label, 2) + 1.6 : 0) + 2.6;
  const h = s.role ? 11 : 8;
  return { w, h };
}

/** キーボードで押したとき(Enter・スペース)。 */
function isActivate(e: KeyboardEvent): boolean {
  if (e.key !== "Enter" && e.key !== " ") return false;
  e.preventDefault();
  return true;
}

/** 押したところが「ぴこーん」と光る輪(3 重)。 */
function Beacon({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <g className="fm-beacon" pointerEvents="none">
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x} cy={y} r={size} fill="var(--brand03)" fillOpacity={0.28} stroke="var(--brand03)" strokeWidth={0.6} />
      ))}
    </g>
  );
}

export function FloorMap({
  seats,
  unplaced,
  myId,
  withPhoto,
  editAll,
}: {
  seats: MapSeat[];
  unplaced: MapPerson[];
  myId: string | null;
  withPhoto: boolean;
  /** 札を動かせる人(社員管理の権限を全社で持つ人)。 */
  /** だれの札でも動かせる(社員管理の権限)。ほかの人は自分の札だけ。 */
  editAll: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Selection>(null);
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** 置き終わって、画面の更新を待っている札の場所(すぐに動いて見えるように)。 */
  const [pending, setPending] = useState<Map<number, Point>>(new Map());
  const [placing, setPlacing] = useState<MapPerson | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const posOf = (s: MapSeat): Point => (drag?.index === s.index ? drag.pos : (pending.get(s.index) ?? s.at));
  const lit = seats.filter((s) => (sel?.kind === "seat" ? s.index === sel.index : sel?.kind === "area" && s.area === sel.key));

  // 選んだ場所が見えるように、地図を横に動かす(スマホは地図が画面より広い)。
  const focusMap = (x: number) => {
    const box = scrollRef.current;
    const svg = svgRef.current;
    if (!box || !svg) return;
    box.scrollTo({ left: (x / FLOOR_MAP_SIZE.width) * svg.clientWidth - box.clientWidth / 2, behavior: "smooth" });
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  // 地図で選んだ人を、横の名簿でも見えるようにする(名簿が横に並ぶ広い画面だけ。スマホは地図から離れないように動かさない)。
  useEffect(() => {
    if (!sel || !listRef.current || !window.matchMedia("(min-width: 1024px)").matches) return;
    const key = sel.kind === "seat" ? `seat-${sel.index}` : `area-${sel.key}`;
    listRef.current.querySelector(`[data-key="${key}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [sel]);

  const movable = (employeeId: string) => canMoveSeat(editAll, myId, employeeId);

  const pickSeat = (s: MapSeat, fromList: boolean) => {
    setSel({ kind: "seat", index: s.index });
    if (fromList) focusMap(s.at.x);
  };
  /** 画面の座標 → 地図の座標(mm)。 */
  const toMap = (e: { clientX: number; clientY: number }): Point | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  /** 札を新しい場所に置く(建物の外なら戻す)。 */
  const save = (index: number | null, employeeId: string, p: Point) => {
    if (!areaAt(p)) {
      setNotice("建物の中に置いてください。");
      return;
    }
    if (index !== null) setPending((m) => new Map(m).set(index, p));
    setNotice(null);
    startSaving(async () => {
      const r = await moveSeatAction({ employeeId, x: p.x, y: p.y });
      if (r.error) {
        setNotice(r.error);
        if (index !== null)
          setPending((m) => {
            const next = new Map(m);
            next.delete(index);
            return next;
          });
        return;
      }
      router.refresh();
    });
  };

  const reset = (s: MapSeat) => {
    if (!s.member) return;
    const employeeId = s.member.id;
    startSaving(async () => {
      const r = await resetSeatAction({ employeeId });
      if (r.error) setNotice(r.error);
      else {
        setSel(null);
        router.refresh();
      }
    });
  };

  // 画面が新しくなったら(保存が反映されたら)、仮の場所は捨てる。
  const [seenSeats, setSeenSeats] = useState(seats);
  if (seenSeats !== seats) {
    setSeenSeats(seats);
    setPending(new Map());
  }

  const onSeatPointerDown = (e: PointerEvent, s: MapSeat) => {
    if (!editing || !s.member || !movable(s.member.id) || saving) return;
    const p = toMap(e);
    if (!p) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag({ index: s.index, employeeId: s.member.id, start: p, pos: posOf(s), moved: false });
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    const p = toMap(e);
    if (!p) return;
    const seat = seats[drag.index];
    const base = pending.get(drag.index) ?? seat.at;
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    setDrag({ ...drag, pos: { x: base.x + dx, y: base.y + dy }, moved: drag.moved || Math.hypot(dx, dy) > 1 });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.moved) save(d.index, d.employeeId, d.pos);
    else pickSeat(seats[d.index], false);
  };

  const pickArea = (key: AreaKey, fromList: boolean) => {
    setSel({ kind: "area", key });
    const area = FLOOR_AREAS.find((a) => a.key === key);
    if (fromList && area) focusMap(area.rect.x + area.rect.w / 2);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <style>{`
        .fm-beacon circle { transform-box: fill-box; transform-origin: center; animation: fm-ping 1.8s ease-out infinite; }
        .fm-beacon circle:nth-child(2) { animation-delay: 0.6s; }
        .fm-beacon circle:nth-child(3) { animation-delay: 1.2s; }
        @keyframes fm-ping { 0% { transform: scale(0.25); opacity: 1; } 100% { transform: scale(2.4); opacity: 0; } }
        .fm-pop { transform-box: fill-box; transform-origin: center; animation: fm-pop 0.45s ease-out; }
        @keyframes fm-pop { 0% { transform: scale(1); } 45% { transform: scale(1.3); } 100% { transform: scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          .fm-beacon circle, .fm-pop { animation: none; }
          .fm-beacon circle:first-child { transform: scale(1.6); opacity: 0.6; }
        }
      `}</style>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="text-brand04 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-5 rounded-sm border border-[#b8962e] bg-[#fff6cc]" />
            よくいる場所
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-3 rounded-sm" style={{ background: ROLE_COLOR.lead }} />
            リーダー・役員
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-3 rounded-sm" style={{ background: ROLE_COLOR.sub }} />
            サブリーダー
          </span>
          <span className="lg:hidden">地図は横に動かせます</span>
          {(editAll || myId !== null) && (
            <button
              type="button"
              onClick={() => {
                setEditing((v) => !v);
                setPlacing(null);
                setNotice(null);
              }}
              className={`ml-auto border px-3 py-1 text-xs font-bold ${
                editing ? "border-brand03 bg-brand03 text-white" : "border-brand01/20 text-brand01 hover:border-brand03 hover:text-brand03 bg-white"
              }`}
            >
              {editing ? "動かし終わる" : "札を動かす"}
            </button>
          )}
        </div>

        {editing && (
          <p className="border-brand03 bg-[#fff6f2] text-brand01 border px-3 py-2 text-xs" role="status">
            {placing
              ? `「${placing.name}」さんを置きたい所を、地図の上で押してください。`
              : editAll
                ? "札をドラッグすると、その人のよくいる場所を変えられます(建物の中に置く)。名簿の下の「配置図にまだいない人」は、名前を押してから地図を押すと置けます。"
                : "自分の札をドラッグすると、自分のよくいる場所を変えられます(建物の中に置く)。配置図にまだいないときは、名簿の下の自分の名前を押してから地図を押すと置けます。"}
            {saving && " 保存しています…"}
            {notice && <span className="ml-1 font-bold text-red-700">{notice}</span>}
          </p>
        )}

        <div ref={scrollRef} className="border-brand01/15 overflow-x-auto border bg-white">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${FLOOR_MAP_SIZE.width} ${FLOOR_MAP_SIZE.height}`}
            className="block w-full min-w-[880px] select-none lg:min-w-0"
            role="img"
            aria-label="会社配置図"
            fontFamily="var(--font-body)"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            onClick={(e) => {
              if (placing) {
                const p = toMap(e);
                if (p) save(null, placing.id, p);
                setPlacing(null);
                return;
              }
              setSel(null);
            }}
          >
            <defs>
              <pattern id="fm-hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="2" height="2" fill="#f4f4f4" />
                <rect width="1" height="2" fill="#e4e4e4" />
              </pattern>
            </defs>

            {/* 本社から離れた場所 */}
            <text x={222} y={24} fontSize={4.2} fontWeight="bold" fill="#555">
              本社から離れた場所
            </text>
            {FLOOR_AREAS.filter((a) => a.away).map((a) => (
              <g key={`away-${a.key}`}>
                <rect {...rectProps(a.away!)} rx={3} fill="#f6f6f1" stroke="#8a8a8a" strokeWidth={0.45} strokeDasharray="2 1.4" />
                <rect x={a.away!.x + 30} y={a.away!.y + 4.6} width={26} height={4.4} rx={1} fill="#777" />
                <text x={a.away!.x + 43} y={a.away!.y + 7.8} fontSize={2.8} fill="#fff" textAnchor="middle">
                  本社とは別の場所
                </text>
              </g>
            ))}

            {/* 建物と部屋(押すと、そこにいる人が光る) */}
            {FLOOR_AREAS.map((a) => {
              const on = sel?.kind === "area" && sel.key === a.key;
              const room = a.key === "office" || a.key === "gijutsu";
              return (
                <rect
                  key={a.key}
                  {...rectProps(a.rect)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${a.name}にいる人を光らせる`}
                  fill={on ? "#fde3da" : room ? "#fbfbfb" : a.open ? "transparent" : "#fff"}
                  stroke={a.open ? (on ? "var(--brand03)" : "none") : on ? "var(--brand03)" : "#333"}
                  strokeWidth={on ? 0.9 : room ? 0.45 : 0.6}
                  strokeDasharray={a.open ? "1.5 1" : undefined}
                  className="cursor-pointer outline-none"
                  onClick={(e) => {
                    if (placing) return;
                    e.stopPropagation();
                    pickArea(a.key, false);
                  }}
                  onKeyDown={(e) => isActivate(e) && pickArea(a.key, false)}
                />
              );
            })}

            {FLOOR_MACHINES.map((m) => (
              <g key={m.label} pointerEvents="none">
                <rect {...rectProps(m.rect)} rx={1} fill="url(#fm-hatch)" stroke="#777" strokeWidth={0.35} strokeDasharray={m.dashed ? "1.2 0.8" : undefined} />
                <text x={m.rect.x + m.rect.w / 2} y={m.rect.y + m.rect.h / 2 + 1} fontSize={2.8} fontWeight="bold" fill="#444" textAnchor="middle" letterSpacing={0.3}>
                  {m.label}
                </text>
              </g>
            ))}
            {FLOOR_DOORS.map((d, i) => (
              <rect key={`door-${i}`} x={d.x - 0.6} y={d.y} width={1.1} height={d.h} fill="#999" pointerEvents="none" />
            ))}
            {FLOOR_WCS.map((w, i) => (
              <g key={`wc-${i}`} pointerEvents="none">
                <rect {...rectProps(w)} fill="#fff" stroke="#333" strokeWidth={0.45} />
                <text x={w.x + w.w / 2} y={w.y + w.h / 2 + 1} fontSize={2.8} fontWeight="bold" fill="#333" textAnchor="middle">
                  WC
                </text>
              </g>
            ))}
            {FLOOR_MARKS.map((p, i) => (
              <circle key={`mark-${i}`} cx={p.x} cy={p.y} r={4} fill="none" stroke="#777" strokeWidth={0.35} strokeDasharray="1 0.8" pointerEvents="none" />
            ))}

            {/* 運転手のトラック */}
            <g transform={`translate(${FLOOR_TRUCK.x} ${FLOOR_TRUCK.y})`} pointerEvents="none">
              <path d="M2 12 V6 Q2 3 5 3 H9 V12 Z" fill="#fff" stroke="#333" strokeWidth={0.5} />
              <rect x={10} y={1.5} width={18} height={10.5} fill="#fff" stroke="#333" strokeWidth={0.5} />
              <text x={19} y={8.3} fontSize={3.6} textAnchor="middle" fontWeight="bold" fill="#003c96">
                LONG
              </text>
              <circle cx={6} cy={12.5} r={1.8} fill="#fff" stroke="#333" strokeWidth={0.5} />
              <circle cx={23} cy={12.5} r={1.8} fill="#fff" stroke="#333" strokeWidth={0.5} />
              <text x={15} y={18.5} fontSize={2.6} textAnchor="middle" fill="#333">
                運転手(配送)
              </text>
            </g>

            {/* 建物の名前と仕事 */}
            {FLOOR_AREAS.map((a) => (
              <g key={`label-${a.key}`} pointerEvents="none">
                {a.title && (
                  <>
                    {a.title.kana && (
                      <text x={a.title.at.x} y={a.title.at.y - a.title.size * 0.62} fontSize={2.3} fill="#666" textAnchor={a.away ? "start" : "middle"}>
                        {a.title.kana}
                      </text>
                    )}
                    <text
                      x={a.title.at.x}
                      y={a.title.at.y + a.title.size * 0.36}
                      fontSize={a.title.size}
                      fontWeight="bold"
                      fill="#222"
                      textAnchor={a.away ? "start" : "middle"}
                      letterSpacing={0.4}
                    >
                      {a.title.text}
                    </text>
                  </>
                )}
                {a.work && (
                  <>
                    <rect
                      x={a.work.at.x - textWidth(a.work.text, 3.4) / 2 - 3}
                      y={a.work.at.y - 2.6}
                      width={textWidth(a.work.text, 3.4) + 6}
                      height={5.2}
                      rx={2}
                      fill="#fff"
                      stroke="#333"
                      strokeWidth={0.35}
                    />
                    <text x={a.work.at.x} y={a.work.at.y + 1.2} fontSize={3.4} fill="#222" textAnchor="middle">
                      {a.work.text}
                    </text>
                  </>
                )}
              </g>
            ))}

            {/* 光る輪(札の下に書く) */}
            {lit.map((s) => (
              <Beacon key={`b-${s.index}-${sel?.kind}`} x={posOf(s).x} y={posOf(s).y} size={sel?.kind === "seat" ? 9 : 5.5} />
            ))}

            {/* よくいる場所の札 */}
            {seats.map((s) => {
              const { w, h } = seatBox(s);
              const on = lit.some((l) => l.index === s.index);
              const me = s.member !== null && s.member.id === myId;
              const at = posOf(s);
              const top = at.y - h / 2;
              const grabbing = drag?.index === s.index;
              return (
                <g
                  key={`${s.index}-${on && sel?.kind === "seat" ? "on" : "off"}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${s.member?.name ?? s.label}(${AREA_NAME.get(s.area)})`}
                  className={`outline-none ${editing && s.member && movable(s.member.id) ? (grabbing ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer"} ${
                    on && sel?.kind === "seat" && !editing ? "fm-pop" : ""
                  }`}
                  style={editing && s.member && movable(s.member.id) ? { touchAction: "none" } : undefined}
                  opacity={grabbing ? 0.85 : 1}
                  onPointerDown={(e) => onSeatPointerDown(e, s)}
                  onClick={(e) => {
                    if (placing) return;
                    e.stopPropagation();
                    // 動かす間は、押したときの選択を onPointerUp で行う。
                    if (!(editing && s.member && movable(s.member.id))) pickSeat(s, false);
                  }}
                  onKeyDown={(e) => isActivate(e) && pickSeat(s, false)}
                >
                  <rect
                    x={at.x - w / 2}
                    y={top}
                    width={w}
                    height={h}
                    rx={1}
                    fill={s.member ? (on ? "#ffe9a8" : "#fff6cc") : "#f3f3f3"}
                    stroke={on ? "var(--brand03)" : me ? "var(--brand03)" : s.member ? "#b8962e" : "#aaa"}
                    strokeWidth={on || me ? 0.7 : 0.35}
                    strokeDasharray={s.member ? undefined : "1 0.6"}
                  />
                  <text x={at.x} y={top + 2.7} fontSize={2.2} fill="#555" textAnchor="middle">
                    {s.yomi}
                  </text>
                  <text x={at.x} y={top + 6.8} fontSize={3.7} fontWeight="bold" fill="#222" textAnchor="middle">
                    {s.label}
                  </text>
                  {s.role && (
                    <>
                      <rect
                        x={at.x - (textWidth(s.role.label, 2) + 1.6) / 2}
                        y={top + 7.8}
                        width={textWidth(s.role.label, 2) + 1.6}
                        height={2.8}
                        rx={0.8}
                        fill={ROLE_COLOR[s.role.kind]}
                      />
                      <text x={at.x} y={top + 9.8} fontSize={2} fill="#fff" textAnchor="middle">
                        {s.role.label}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <InfoCard
          sel={sel}
          seats={seats}
          myId={myId}
          withPhoto={withPhoto}
          onPickSeat={(s) => pickSeat(s, true)}
          onReset={editing ? reset : null}
          movable={movable}
        />
      </div>

      <div ref={listRef} className="border-brand01/15 flex flex-col border bg-white lg:max-h-[80vh] lg:overflow-y-auto">
        {FLOOR_AREAS.map((a) => {
          const people = seats.filter((s) => s.area === a.key);
          if (people.length === 0) return null;
          const areaOn = sel?.kind === "area" && sel.key === a.key;
          return (
            <section key={a.key}>
              <button
                type="button"
                data-key={`area-${a.key}`}
                onClick={() => pickArea(a.key, true)}
                className={`flex w-full items-baseline justify-between px-3 py-1.5 text-left text-sm font-bold text-white ${
                  areaOn ? "bg-brand03" : "bg-brand01 hover:bg-brand03"
                }`}
              >
                {a.name}
                <span className="text-xs font-normal">{people.length}人</span>
              </button>
              <ul>
                {people.map((s) => {
                  const on = sel?.kind === "seat" && sel.index === s.index;
                  return (
                    <li key={s.index}>
                      <button
                        type="button"
                        data-key={`seat-${s.index}`}
                        onClick={() => pickSeat(s, true)}
                        className={`border-brand01/10 flex w-full items-center gap-2 border-b px-3 py-1.5 text-left ${
                          on ? "bg-[#fde3da]" : "hover:bg-brand01/5"
                        }`}
                      >
                        {s.member ? (
                          <Avatar employeeId={s.member.id} name={s.member.name} withPhoto={withPhoto} />
                        ) : (
                          <span aria-hidden className="bg-brand04/40 flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">
                            {s.label.slice(0, 1)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="text-brand01 block truncate text-sm font-bold">{s.member?.name ?? s.label}</span>
                          <span className="text-brand04 block truncate text-xs">
                            {/[A-Z]/.test(s.label) ? s.yomi : (s.member?.nameKana ?? s.yomi)}
                            {s.role && <span style={{ color: ROLE_COLOR[s.role.kind] }}> ・{s.role.label}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {unplaced.length > 0 && (
          <section>
            <p className="bg-brand04 px-3 py-1.5 text-sm font-bold text-white">
              配置図にまだいない人<span className="ml-2 text-xs font-normal">{unplaced.length}人</span>
            </p>
            <ul className="text-brand04 flex flex-col gap-1 px-3 py-2 text-xs">
              {unplaced.map((p) =>
                editing && movable(p.id) ? (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPlacing(p);
                        setNotice(null);
                        scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }}
                      className={`w-full border px-2 py-1 text-left font-bold ${
                        placing?.id === p.id ? "border-brand03 text-brand03" : "border-brand01/20 text-brand01 hover:border-brand03"
                      }`}
                    >
                      {p.name}
                      <span className="text-brand04 ml-1 font-normal">を地図に置く</span>
                    </button>
                  </li>
                ) : (
                  <li key={p.id}>{p.name}</li>
                ),
              )}
            </ul>
          </section>
        )}
      </div>
    </div>
  );

  function rectProps(r: { x: number; y: number; w: number; h: number }) {
    return { x: r.x, y: r.y, width: r.w, height: r.h };
  }
}

/** 地図の下の「いま光っている人・場所」の説明。 */
function InfoCard({
  sel,
  seats,
  myId,
  withPhoto,
  onPickSeat,
  onReset,
  movable,
}: {
  sel: Selection;
  seats: MapSeat[];
  myId: string | null;
  withPhoto: boolean;
  onPickSeat: (s: MapSeat) => void;
  /** 札を動かしている間だけ。動かした札を元の場所に戻す。 */
  onReset: ((s: MapSeat) => void) | null;
  movable: (employeeId: string) => boolean;
}) {
  if (!sel) {
    return (
      <p className="text-brand04 border-brand01/15 border bg-white px-4 py-3 text-sm">
        右の名簿で名前を押すと、地図の上でその人の場所が光ります。地図の建物を押すと、そこにいる人がみんな光ります。
      </p>
    );
  }
  if (sel.kind === "area") {
    const people = seats.filter((s) => s.area === sel.key);
    return (
      <div className="border-brand03 border bg-white px-4 py-3">
        <p className="text-brand01 font-bold">
          {AREA_NAME.get(sel.key)}
          <span className="text-brand04 ml-2 text-sm font-normal">{people.length}人</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {people.map((s) => (
            <button
              key={s.index}
              type="button"
              onClick={() => onPickSeat(s)}
              className="border-brand01/20 text-brand01 hover:border-brand03 hover:text-brand03 border px-2 py-1 text-xs font-bold"
            >
              {s.member?.name ?? s.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  const s = seats[sel.index];
  const m = s.member;
  return (
    <div className="border-brand03 flex flex-wrap items-center gap-3 border bg-white px-4 py-3">
      {m ? (
        <Avatar employeeId={m.id} name={m.name} withPhoto={withPhoto} />
      ) : (
        <span aria-hidden className="bg-brand04/40 flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">
          {s.label.slice(0, 1)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-brand01 font-bold">
          {m?.name ?? s.label}
          {m && m.id === myId && <span className="text-brand03 ml-2 text-xs">あなた</span>}
        </p>
        <p className="text-brand04 text-xs">
          {[/[A-Z]/.test(s.label) ? s.yomi : (m?.nameKana ?? s.yomi), AREA_NAME.get(s.area), s.role?.label ?? m?.positionName]
            .filter(Boolean)
            .join(" ・ ")}
        </p>
        {!m && <p className="text-brand04 mt-1 text-xs">ポータルの社員に見つからない人です(名簿にいない、または名前のつづりが違う)。</p>}
      </div>
      {m && withPhoto && m.id !== myId && <TalkLink employeeId={m.id} name={m.name} compact={false} />}
      {onReset && s.moved && m && movable(m.id) && (
        <button
          type="button"
          onClick={() => onReset(s)}
          className="border-brand01/20 text-brand01 hover:border-brand03 hover:text-brand03 border bg-white px-3 py-2 text-xs font-bold"
        >
          {s.index < FLOOR_SEATS.length ? "元の場所に戻す" : "配置図から外す"}
        </button>
      )}
    </div>
  );
}
