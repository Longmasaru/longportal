"use client";

import { useEffect, type CSSProperties, type ReactNode, type SVGProps } from "react";
import { createPortal } from "react-dom";

// ツッコミを送った瞬間の演出(docs/DESIGN.md 32 章)。パチンコの激アツ演出に寄せる:
// 暗転 → 赤い帯のカットインで裏手が「ビシィッ!!」→ 白く光って金の放射 →「ツッコミ」が 1 字ずつ落ちて
// 「ィィィイイイ‼」→「なんでやねん!!」で虹色に格上げ。押しても下の画面を邪魔しない(pointer-events なし)。
// 動きを減らす設定の人には、文字だけを静かに出す。
const DURATION_MS = 3400;
export const BURST_FONT = "'Dela Gothic One'";
const FONT = `${BURST_FONT},'Zen Kaku Gothic New',sans-serif`;
/** 演出で使う字(書き欄を開いたときに先に読み込んでおく)。 */
export const BURST_TEXT = "ツッコミィイ‼！ビシッなんでやねん";

const CSS = `
.tk{position:fixed;inset:0;z-index:100;pointer-events:none;overflow:hidden;animation:tk-out ${DURATION_MS}ms ease-in forwards}
.tk *{box-sizing:border-box}
.tk-dark{position:absolute;inset:0;background:#000;animation:tk-fade-in .12s both}
.tk-gold,.tk-rainbow{position:absolute;left:50%;top:50%;width:300vmax;height:300vmax;margin:-150vmax 0 0 -150vmax;opacity:0}
.tk-gold{background:repeating-conic-gradient(#fff3b0 0deg 5deg,#ffb300 5deg 10deg,#e65100 10deg 15deg,#ffca28 15deg 20deg);animation:tk-show .01s .4s both,tk-spin 3s .4s linear infinite}
.tk-rainbow{background:repeating-conic-gradient(#ff1744 0deg 5deg,#ff9100 5deg 10deg,#ffea00 10deg 15deg,#00e676 15deg 20deg,#00b0ff 20deg 25deg,#d500f9 25deg 30deg);animation:tk-fade-in .25s 1.2s both,tk-spin 2s 1.2s linear infinite reverse}
.tk-glow{position:absolute;inset:0;background:radial-gradient(circle at 50% 48%,#fff 0%,rgb(255 255 255 / .85) 12%,rgb(255 255 255 / 0) 42%),radial-gradient(circle,transparent 45%,rgb(0 0 0 / .75) 100%);opacity:0;animation:tk-show .01s .4s both}
.tk-lines{position:absolute;inset:-10%;background:repeating-conic-gradient(from 2deg,rgb(0 0 0 / .5) 0deg .6deg,transparent .6deg 7deg);-webkit-mask:radial-gradient(circle,transparent 30%,#000 70%);mask:radial-gradient(circle,transparent 30%,#000 70%);opacity:0;animation:tk-show .01s .4s both,tk-jitter .08s steps(2) infinite}
.tk-flash{position:absolute;inset:0;background:#fff;opacity:0;animation:tk-flash .45s .34s ease-out both}
.tk-band{position:absolute;left:-10%;right:-10%;top:28%;height:44%;transform:skewY(-9deg);background:linear-gradient(#000 0 3%,#fff 3% 5%,#c50000 5% 95%,#fff 95% 97%,#000 97%);overflow:hidden;animation:tk-band .42s cubic-bezier(.2,.9,.3,1) both,tk-fade-out .3s .42s both}
.tk-band::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 40px,rgb(255 255 255 / .35) 40px 42px,transparent 42px 90px,rgb(255 255 255 / .2) 90px 140px,transparent 140px 200px);animation:tk-stream .18s linear infinite}
.tk-hand{position:absolute;left:50%;top:50%;width:min(84vw,46rem,70vh);transform:translate(-50%,-50%);animation:tk-slap .34s cubic-bezier(.75,0,.95,.45) both,tk-recoil .4s .36s ease-out both}
.tk-hand svg{display:block;width:100%;height:auto;overflow:visible}
.tk-boom{position:absolute;left:50%;top:46%;width:min(96vw,46rem,80vh);transform:translate(-50%,-50%);animation:tk-boom .5s .34s cubic-bezier(.2,1.6,.4,1) both,tk-fade-out .2s .6s both}
.tk-boom svg,.tk-word svg{display:block;width:100%;height:auto;overflow:visible}
.tk-stage{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:min(1.5vh,1rem);animation:tk-quake .6s .4s both,tk-buzz .12s 1.1s steps(2) infinite}
.tk-word{width:min(94vw,66rem,110vh)}
.tk-glyph{transform-box:fill-box;transform-origin:50% 60%;animation:tk-drop .34s cubic-bezier(.2,1.7,.4,1) both}
.tk-tail{width:min(96vw,62rem,100vh);transform-origin:0 50%;animation:tk-stretch .4s .82s cubic-bezier(.2,1.5,.4,1) both}
.tk-tail .tk-wave{animation:tk-wave .16s 1.2s ease-in-out infinite alternate}
.tk-nande{width:min(92vw,52rem,85vh);margin-top:min(2vh,1.2rem);animation:tk-stamp .4s 1.15s cubic-bezier(.2,1.8,.4,1) both}
.tk-spark{position:absolute;width:min(9vw,3.4rem);opacity:0;animation:tk-twinkle .7s ease-in-out infinite}
@keyframes tk-fade-in{from{opacity:0}to{opacity:1}}
@keyframes tk-fade-out{to{opacity:0}}
@keyframes tk-show{to{opacity:1}}
@keyframes tk-spin{to{transform:rotate(360deg)}}
@keyframes tk-jitter{to{transform:rotate(2deg) scale(1.03)}}
@keyframes tk-flash{0%{opacity:0}8%{opacity:1}100%{opacity:0}}
@keyframes tk-band{0%{transform:skewY(-9deg) scaleY(0)}100%{transform:skewY(-9deg) scaleY(1)}}
@keyframes tk-stream{to{background-position:-200px 0}}
@keyframes tk-slap{0%{transform:translate(70%,-50%) rotate(14deg)}100%{transform:translate(-62%,-50%) rotate(-6deg)}}
@keyframes tk-recoil{0%{transform:translate(-62%,-50%) rotate(-6deg)}100%{opacity:0;transform:translate(-30%,-56%) rotate(4deg) scale(1.2)}}
@keyframes tk-boom{0%{opacity:0;scale:.2}100%{opacity:1;scale:1}}
@keyframes tk-quake{0%,100%{translate:0 0}12%{translate:-5% 4%}24%{translate:6% -3%}36%{translate:-4% -3%}48%{translate:4% 3%}60%{translate:-2% 2%}72%{translate:2% -1%}}
@keyframes tk-buzz{to{translate:.4% -.4%}}
@keyframes tk-drop{0%{opacity:0;transform:translateY(-120%) scale(2.4)}55%{opacity:1;transform:translateY(6%) scale(.86,1.12)}100%{opacity:1;transform:none}}
@keyframes tk-stretch{0%{opacity:0;transform:scaleX(0)}100%{opacity:1;transform:scaleX(1)}}
@keyframes tk-wave{to{transform:translateY(-3%)}}
@keyframes tk-stamp{0%{opacity:0;transform:scale(3.2) rotate(-14deg)}100%{opacity:1;transform:rotate(-3deg)}}
@keyframes tk-twinkle{0%,100%{opacity:0;transform:scale(.3) rotate(0)}50%{opacity:1;transform:scale(1) rotate(45deg)}}
@keyframes tk-out{0%,90%{opacity:1;transform:none}100%{opacity:0;transform:scale(1.08)}}
@media (prefers-reduced-motion:reduce){
.tk{animation:tk-out ${DURATION_MS}ms linear forwards}
.tk-band,.tk-hand,.tk-boom,.tk-flash,.tk-lines,.tk-rainbow,.tk-spark{display:none}
.tk-gold,.tk-glow{animation:none;opacity:1}
.tk-stage,.tk-glyph,.tk-tail,.tk-tail .tk-wave,.tk-nande{animation:none}
}`;

/** パチンコの文字: 金(または赤)の地に、白・赤・黒の重ね縁取りと、厚みの影と、上半分のつや。 */
function Ink({ id, text, x, y, size, tone, length, className, style }: {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  tone: "gold" | "red" | "white";
  length?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const fit = length ? { textLength: length, lengthAdjust: "spacingAndGlyphs" as const } : {};
  const t = (props: SVGProps<SVGTextElement>) => (
    <text x={x} y={y} fontSize={size} fontFamily={FONT} strokeLinejoin="round" paintOrder="stroke" {...fit} {...props}>
      {text}
    </text>
  );
  const mid = tone === "red" ? "#ffffff" : "#d50000";
  return (
    <g className={className} style={style}>
      {t({ fill: "#2a0000", stroke: "#2a0000", strokeWidth: size * 0.34, transform: `translate(0 ${size * 0.08})` })}
      {t({ fill: "#000", stroke: "#000", strokeWidth: size * 0.32 })}
      {t({ fill: mid, stroke: mid, strokeWidth: size * 0.22 })}
      {t({ fill: "#fff", stroke: tone === "red" ? "#000" : "#fff", strokeWidth: size * 0.08 })}
      {t({ fill: `url(#${id}-${tone})` })}
      {t({ fill: `url(#${id}-gloss)` })}
    </g>
  );
}

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fffde7" />
        <stop offset=".3" stopColor="#ffe066" />
        <stop offset=".5" stopColor="#ffb300" />
        <stop offset=".53" stopColor="#fff59d" />
        <stop offset=".75" stopColor="#ff9800" />
        <stop offset="1" stopColor="#a84300" />
      </linearGradient>
      <linearGradient id={`${id}-red`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff8a80" />
        <stop offset=".45" stopColor="#ff1744" />
        <stop offset=".5" stopColor="#d50000" />
        <stop offset="1" stopColor="#7f0000" />
      </linearGradient>
      <linearGradient id={`${id}-white`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".6" stopColor="#f5f5f5" />
        <stop offset="1" stopColor="#b0bec5" />
      </linearGradient>
      <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".85" />
        <stop offset=".42" stopColor="#fff" stopOpacity=".15" />
        <stop offset=".43" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

function Word({ id, viewBox, children, className }: { id: string; viewBox: string; children: ReactNode; className: string }) {
  return (
    <div className={className}>
      <svg viewBox={viewBox}>
        <Defs id={id} />
        {children}
      </svg>
    </div>
  );
}

/** 裏手(右手の甲。指先を左に向けて、横から払う)。 */
function HandArt() {
  const ink = { stroke: "#141414", strokeWidth: 6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const fingers = [
    { x: 30, y: 56, w: 116, h: 27 },
    { x: 16, y: 84, w: 130, h: 27 },
    { x: 26, y: 112, w: 120, h: 27 },
    { x: 50, y: 140, w: 96, h: 24 },
  ];
  const hand = (
    <>
      <path d="M200 70 C188 42 166 20 140 12 C124 8 116 22 124 34 C136 52 150 66 160 78 Z" fill="#ffcfa6" {...ink} />
      {fingers.map((f, i) => (
        <g key={i}>
          <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={f.h / 2} fill="#ffcfa6" {...ink} />
          <rect x={f.x + 6} y={f.y + 5} width={18} height={f.h - 10} rx={6} fill="#fff1e6" stroke="#141414" strokeWidth={3} />
          <path d={`M${f.x + 50} ${f.y + 6} q4 ${f.h / 2 - 6} 0 ${f.h - 12}`} fill="none" stroke="#c98a62" strokeWidth={3} strokeLinecap="round" />
        </g>
      ))}
      <path d="M246 76 C222 66 184 54 150 54 L132 56 C120 58 112 68 112 80 L112 150 C112 162 120 170 132 170 L172 168 C204 164 228 156 246 150 Z" fill="#ffcfa6" {...ink} />
      <path d="M136 72 C160 66 196 70 222 82" fill="none" stroke="#fff3e8" strokeWidth={8} strokeLinecap="round" opacity={0.8} />
      <path d="M124 96 q8 -4 0 -12 M124 124 q8 -4 0 -12 M124 150 q8 -4 0 -12" fill="none" stroke="#c98a62" strokeWidth={3} strokeLinecap="round" />
      <path d="M150 158 C180 156 210 150 236 140" fill="none" stroke="#e8a77c" strokeWidth={6} strokeLinecap="round" />
      <rect x={238} y={60} width={34} height={104} rx={6} fill="#fafafa" {...ink} />
      <rect x={252} y={104} width={10} height={14} rx={3} fill="#b0bec5" stroke="#141414" strokeWidth={2} />
      <path d="M268 50 L330 40 L330 190 L268 176 Z" fill="#263238" {...ink} />
    </>
  );
  return (
    <svg viewBox="0 0 330 200" aria-hidden="true">
      <defs>
        <filter id="tk-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6 1" />
        </filter>
      </defs>
      <g opacity={0.18} filter="url(#tk-blur)" transform="translate(150 0)">{hand}</g>
      <g opacity={0.35} filter="url(#tk-blur)" transform="translate(80 0)">{hand}</g>
      {[40, 78, 118, 150].map((y, i) => (
        <rect key={y} x={250 + i * 14} y={y} width={220} height={i % 2 ? 4 : 7} rx={3} fill="#fff" opacity={0.85} />
      ))}
      {hand}
    </svg>
  );
}

function Boom() {
  const points = Array.from({ length: 28 }, (_, i) => {
    const r = i % 2 ? 46 : 100 - (i % 4) * 9;
    const a = (i / 28) * Math.PI * 2;
    return `${(150 + Math.cos(a) * r * 1.35).toFixed(1)},${(100 + Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");
  return (
    <div className="tk-boom">
      <svg viewBox="0 0 300 200">
        <Defs id="tkb" />
        <polygon points={points} fill="#fff" stroke="#000" strokeWidth={6} strokeLinejoin="round" />
        <polygon points={points} fill="#ffeb3b" transform="translate(150 100) scale(.62) translate(-150 -100)" />
        <Ink id="tkb" text="ビシィッ!!" x={25} y={124} size={64} tone="white" length={250} style={{ transform: "rotate(-8deg)", transformOrigin: "150px 100px" }} />
      </svg>
    </div>
  );
}

const SPARKS = [
  [8, 14, 0], [86, 10, 0.2], [14, 78, 0.35], [90, 70, 0.1], [50, 6, 0.45], [70, 88, 0.25],
  [30, 30, 0.5], [76, 34, 0.05], [22, 56, 0.3], [64, 62, 0.4], [44, 90, 0.15], [92, 44, 0.55],
] as const;

export function TsukkomiBurst({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, DURATION_MS);
    // 対応している端末(Android など)では、叩いた瞬間と格上げで震わせる。
    const buzz = window.setTimeout(() => navigator.vibrate?.([60, 40, 30, 500, 120]), 330);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(buzz);
    };
  }, [onDone]);

  const main = [..."ツッコミ"];
  return createPortal(
    <div className="tk" role="status" aria-label="ツッコミを送りました">
      <style>{CSS}</style>
      <div className="tk-dark" />
      <div className="tk-gold" />
      <div className="tk-rainbow" />
      <div className="tk-glow" />
      <div className="tk-lines" />
      <div className="tk-band" aria-hidden="true">
        <div className="tk-hand">
          <HandArt />
        </div>
      </div>
      <div className="tk-flash" />
      <Boom />
      {SPARKS.map(([left, top, delay], i) => (
        <svg
          key={i}
          className="tk-spark"
          viewBox="-10 -10 20 20"
          style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${0.5 + delay}s` }}
          aria-hidden="true"
        >
          <path d="M0 -10 Q1.2 -1.2 10 0 Q1.2 1.2 0 10 Q-1.2 1.2 -10 0 Q-1.2 -1.2 0 -10Z" fill="#fff" stroke="#ffd54f" strokeWidth={0.8} />
        </svg>
      ))}
      <div className="tk-stage" aria-hidden="true">
        <Word id="tkm" viewBox="-40 -150 1080 340" className="tk-word">
          {main.map((c, i) => (
            <Ink
              key={i}
              id="tkm"
              text={c}
              x={i * 250 + 12}
              y={110}
              size={240}
              tone="gold"
              className="tk-glyph"
              style={{ animationDelay: `${0.48 + i * 0.09}s` }}
            />
          ))}
        </Word>
        <Word id="tkt" viewBox="-30 -150 1260 260" className="tk-tail">
          <g className="tk-wave">
            <Ink id="tkt" text="ィィィイイイイイ‼！！" x={0} y={66} size={190} tone="gold" length={1200} />
          </g>
        </Word>
        <Word id="tkn" viewBox="-60 -140 1220 260" className="tk-nande">
          <g transform="skewX(-12)">
            <rect x={-20} y={-126} width={1180} height={232} rx={18} fill="#000" stroke="#ffd54f" strokeWidth={12} />
            <rect x={6} y={-100} width={1128} height={180} rx={10} fill="none" stroke="#ff1744" strokeWidth={5} />
          </g>
          <Ink id="tkn" text="なんでやねん！！" x={40} y={52} size={150} tone="red" length={1060} />
        </Word>
      </div>
    </div>,
    document.body,
  );
}
