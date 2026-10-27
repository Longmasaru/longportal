"use client";

import { useCallback, useRef, useState } from "react";

// ビフォーとアフターを 1 枚に重ね、境目を指(マウス)で動かして見比べる(docs/DESIGN.md 44 章)。
// キーボードでは ← → で動かせる。最初は真ん中。

export function BeforeAfter({ beforeSrc, afterSrc }: { beforeSrc: string; afterSrc: string }) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = useCallback((clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  return (
    <div
      ref={box}
      className="bg-field relative aspect-[4/3] w-full touch-pan-y overflow-hidden select-none"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        moveTo(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) moveTo(e.clientX);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 見られる人だけ R2 へ転送する入口の画像 */}
      <img src={afterSrc} alt="アフター(改善後)" draggable={false} className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 見られる人だけ R2 へ転送する入口の画像 */}
        <img src={beforeSrc} alt="ビフォー(改善前)" draggable={false} className="absolute inset-0 size-full object-cover" />
      </div>
      <span className="font-heading text-brand04 absolute top-2 left-2 bg-white/90 px-2 text-xs leading-6 font-bold tracking-widest">
        BEFORE
      </span>
      <span className="font-heading bg-brand01 absolute top-2 right-2 px-2 text-xs leading-6 font-bold tracking-widest text-white">
        AFTER
      </span>
      <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white" style={{ left: `${pos}%` }} aria-hidden>
        <span className="border-brand01 text-brand01 absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 bg-white text-sm font-bold">
          ⇔
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(pos)}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="ビフォーとアフターの境目"
        className="absolute inset-x-0 bottom-0 h-8 w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
