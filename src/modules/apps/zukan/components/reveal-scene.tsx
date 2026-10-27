"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RARITY_LABEL, type Rarity } from "../constants";
import { markRevealSeenAction } from "../actions";
import { RARITY_COLOR } from "./rarity";

// 鑑定の結果が開く演出(docs/DESIGN.md 44 章)。本人が初めてページを開いたときだけ、
// 「鑑定中」の札が裏返って、星とレア度の色が出る。星は 1 つずつ灯る(★の数だけ待つので、高いほど少し長い)。
// 低い点でも同じ演出にして、恥をかかせない(講評は下に静かに出す)。見たことはサーバーに残し、2 回目は出さない。

const CSS = `
.zv-card{position:relative;perspective:40rem;width:100%;max-width:22rem;margin:0 auto;cursor:pointer}
.zv-inner{position:relative;transform-style:preserve-3d;animation:zv-flip .7s .5s cubic-bezier(.4,0,.2,1) forwards}
.zv-face{backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.4rem;min-height:9rem;background:#fff;padding:1rem}
.zv-front{border:1px dashed rgb(0 60 150 / .35);color:#5c6b84;font-weight:700;letter-spacing:.2em}
.zv-back{position:absolute;inset:0;transform:rotateY(180deg)}
.zv-star{display:inline-block;opacity:.12;scale:.6;animation:zv-star .3s cubic-bezier(.2,1.6,.4,1) forwards}
.zv-label{opacity:0;animation:zv-rise .4s ease-out forwards;font-weight:700;font-size:.9rem}
.zv-score{opacity:0;animation:zv-rise .4s ease-out forwards;color:#003c96;font-size:.8rem}
@keyframes zv-flip{to{transform:rotateY(180deg)}}
@keyframes zv-star{to{opacity:1;scale:1}}
@keyframes zv-rise{from{opacity:0;translate:0 .3rem}to{opacity:1;translate:0 0}}
@media (prefers-reduced-motion:reduce){
.zv-inner{animation:none;transform:rotateY(180deg)}
.zv-star,.zv-label,.zv-score{animation:none;opacity:1;scale:1}
}`;

export function RevealScene({ entryId, rarity, score }: { entryId: string; rarity: Rarity; score: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    markRevealSeenAction(entryId).catch(() => {});
  }, [entryId]);

  if (!open) return null;
  const color = RARITY_COLOR[rarity === 1 ? 4 : rarity];
  const starsAt = 1.25;
  const step = 0.28;
  const after = starsAt + rarity * step;

  return (
    <div
      className="zv-card"
      role="status"
      aria-label={`鑑定の結果: ★${rarity}(${RARITY_LABEL[rarity]})、${score} 点`}
      onClick={() => {
        setOpen(false);
        router.refresh();
      }}
    >
      <style>{CSS}</style>
      <div className="zv-inner" aria-hidden="true">
        <div className="zv-face zv-front">鑑定中</div>
        <div className="zv-face zv-back" style={{ border: `2px solid ${RARITY_COLOR[rarity]}` }}>
          <p className="text-3xl tracking-tight" style={{ color }}>
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className="zv-star"
                style={i < rarity ? { animationDelay: `${starsAt + i * step}s` } : { animation: "none", opacity: 0.12, scale: "1" }}
              >
                ★
              </span>
            ))}
          </p>
          <p className="zv-label" style={{ color: RARITY_COLOR[rarity], animationDelay: `${after}s` }}>
            {RARITY_LABEL[rarity]}
          </p>
          <p className="zv-score" style={{ animationDelay: `${after + 0.15}s` }}>
            {score} 点
          </p>
        </div>
      </div>
    </div>
  );
}
