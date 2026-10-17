import { ABILITY_AXES } from "../labels";
import { radarPoint } from "../logic";
import type { HrSheet } from "../types";

// 能力の 5 項目のレーダーチャート(docs/DESIGN.md 31.2)。サーバーで SVG を描く。
// 付いていない軸は 0 として描き、ラベルに「—」を出す。

const MAX = 5;
const SIZE = { w: 300, h: 250 };
const CENTER = { x: 150, y: 128 };
const RADIUS = 82;

function ring(level: number): string {
  return ABILITY_AXES.map((_, i) => {
    const pt = radarPoint(i, ABILITY_AXES.length, level, MAX, RADIUS, CENTER.x, CENTER.y);
    return `${pt.x},${pt.y}`;
  }).join(" ");
}

/** list を付けると、図の代わりに ★ の一覧を出す(図はページ上の「まとめ」にあるため)。 */
export function AbilityRadar({ abilities, list }: { abilities: HrSheet["abilities"]; list?: boolean }) {
  const rated = ABILITY_AXES.filter((a) => abilities[a.key] !== undefined).length;
  if (rated === 0) {
    return (
      <p className="text-brand04 text-sm">
        まだ評価が付いていません。「スキルと資格」の「能力の評価」で 1〜5 を付けると、ここに図で表示されます。
      </p>
    );
  }
  const count = ABILITY_AXES.length;
  const points = ABILITY_AXES.map((a, i) => radarPoint(i, count, abilities[a.key] ?? 0, MAX, RADIUS, CENTER.x, CENTER.y));
  const summary = ABILITY_AXES.map((a) => `${a.label} ${abilities[a.key] ?? "未評価"}`).join("、");

  if (list) return <AbilityList abilities={abilities} />;
  return (
    <svg viewBox={`0 0 ${SIZE.w} ${SIZE.h}`} className="w-full max-w-[300px]" role="img" aria-label={`能力の評価(5 段階): ${summary}`}>
      {[1, 2, 3, 4, 5].map((lv) => (
        <polygon
          key={lv}
          points={ring(lv)}
          fill="none"
          className={lv === MAX ? "stroke-brand04/50" : "stroke-brand04/20"}
          strokeWidth={1}
        />
      ))}
      {ABILITY_AXES.map((a, i) => {
        const end = radarPoint(i, count, MAX, MAX, RADIUS, CENTER.x, CENTER.y);
        return <line key={a.key} x1={CENTER.x} y1={CENTER.y} x2={end.x} y2={end.y} className="stroke-brand04/20" strokeWidth={1} />;
      })}
      <polygon
        points={points.map((pt) => `${pt.x},${pt.y}`).join(" ")}
        className="fill-brand01/15 stroke-brand01"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {ABILITY_AXES.map((a, i) => {
        const level = abilities[a.key];
        const pt = points[i];
        const label = radarPoint(i, count, MAX, MAX, RADIUS + 20, CENTER.x, CENTER.y);
        const anchor = label.x > CENTER.x + 2 ? "start" : label.x < CENTER.x - 2 ? "end" : "middle";
        return (
          <g key={a.key}>
            {level !== undefined ? (
              <circle cx={pt.x} cy={pt.y} r={4.5} className="fill-brand01 stroke-white" strokeWidth={2}>
                <title>{`${a.label}: ${level}`}</title>
              </circle>
            ) : null}
            <text
              x={label.x}
              y={label.y + (label.y > CENTER.y + 2 ? 8 : 0)}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="fill-brand01 text-[12px] font-bold"
            >
              {a.label}
              <tspan dx={4} className={level !== undefined ? "fill-brand03" : "fill-brand04"}>
                {level ?? "—"}
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function AbilityList({ abilities }: { abilities: HrSheet["abilities"] }) {
  return (
    <dl className="flex min-w-40 flex-col gap-1.5 text-sm">
      {ABILITY_AXES.map((a) => {
        const level = abilities[a.key];
        return (
          <div key={a.key} className="flex items-center justify-between gap-4">
            <dt className="text-brand01">{a.label}</dt>
            <dd aria-label={level !== undefined ? `${level}` : "未評価"}>
              {level !== undefined ? (
                <>
                  <span className="text-brand03 tracking-widest">{"★".repeat(level)}</span>
                  <span className="text-brand04/40 tracking-widest">{"★".repeat(MAX - level)}</span>
                </>
              ) : (
                <span className="text-brand04">未評価</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
