"use client";

import { useEffect, type CSSProperties, type ReactNode, type SVGProps } from "react";
import { createPortal } from "react-dom";

// ツッコミを送った瞬間の演出(docs/DESIGN.md 32 章)。パチンコの激アツ演出に寄せる:
// 暗転 → 赤い帯のカットインで裏手が「ビシィッ!!」→ 白く光って金の放射 →「ツッコミ」が 1 字ずつ落ちて
// 「！！！」で虹色に格上げ。押しても下の画面を邪魔しない(pointer-events なし)。
// 動きを減らす設定の人には、文字だけを静かに出す。
const DURATION_MS = 3000;
export const BURST_FONT = "'Dela Gothic One'";
const FONT = `${BURST_FONT},'Zen Kaku Gothic New',sans-serif`;
/** 演出で使う字(書き欄を開いたときに先に読み込んでおく)。 */
export const BURST_TEXT = "ツッコミ！ビシィッ!";

const CSS = `
.tk{position:fixed;inset:0;z-index:100;pointer-events:none;overflow:hidden;animation:tk-out ${DURATION_MS}ms ease-in forwards}
.tk *{box-sizing:border-box}
.tk-dark{position:absolute;inset:0;background:#000;animation:tk-fade-in .12s both}
.tk-gold,.tk-rainbow{position:absolute;left:50%;top:50%;width:300vmax;height:300vmax;margin:-150vmax 0 0 -150vmax;opacity:0}
.tk-gold{background:repeating-conic-gradient(#fff3b0 0deg 5deg,#ffb300 5deg 10deg,#e65100 10deg 15deg,#ffca28 15deg 20deg);animation:tk-show .01s .4s both,tk-spin 3s .4s linear infinite}
.tk-rainbow{background:repeating-conic-gradient(#ff1744 0deg 5deg,#ff9100 5deg 10deg,#ffea00 10deg 15deg,#00e676 15deg 20deg,#00b0ff 20deg 25deg,#d500f9 25deg 30deg);animation:tk-fade-in .25s 1.12s both,tk-spin 2s 1.12s linear infinite reverse}
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
.tk-word{width:min(92vw,72rem,130vh)}
.tk-tall{display:none;width:min(88vw,40rem,60vh)}
@media (max-aspect-ratio:1/1){.tk-word{display:none}.tk-tall{display:block}}
.tk-glyph{transform-box:fill-box;transform-origin:50% 60%;animation:tk-drop .34s cubic-bezier(.2,1.7,.4,1) both}
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
@keyframes tk-twinkle{0%,100%{opacity:0;transform:scale(.3) rotate(0)}50%{opacity:1;transform:scale(1) rotate(45deg)}}
@keyframes tk-out{0%,90%{opacity:1;transform:none}100%{opacity:0;transform:scale(1.08)}}
@media (prefers-reduced-motion:reduce){
.tk{animation:tk-out ${DURATION_MS}ms linear forwards}
.tk-band,.tk-hand,.tk-boom,.tk-flash,.tk-lines,.tk-rainbow,.tk-spark{display:none}
.tk-gold,.tk-glow{animation:none;opacity:1}
.tk-stage,.tk-glyph{animation:none}
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
  const ink = { stroke: "#141414", strokeWidth: 5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const crease = { fill: "none", strokeLinecap: "round" as const };
  const hand = (
    <>
      {/* 親指(手の下に添える) */}
      <path d="M220 146 C192 162 160 170 134 166 C118 164 114 152 124 147 C146 140 174 136 204 130 Z" fill="#f2b48a" {...ink} />
      {/* 手の甲と、そろえた 4 本の指(中指がいちばん長い) */}
      <path
        d="M244 68 C218 58 190 56 164 60 L96 68 C76 70 62 74 58 81 C54 88 58 92 66 92 C54 93 46 97 46 104 C46 111 54 114 62 114 C53 117 53 125 59 128 C65 131 74 131 82 129 C75 133 77 141 86 143 L152 148 C190 152 220 150 244 144 Z"
        fill="#ffcfa6"
        {...ink}
      />
      <path d="M68 92 C96 91 118 91 140 91 M64 114 C94 113 118 112 140 112 M84 129 C104 129 122 130 140 131" stroke="#b9774f" strokeWidth={2.6} {...crease} />
      <path
        d="M106 76 q-3 6 0 11 M98 97 q-3 6 0 11 M100 117 q-3 5 0 9 M112 133 q-2 4 0 7 M148 70 q7 4 3 11 M150 94 q7 4 3 11 M150 116 q6 4 3 10 M150 134 q5 3 2 8"
        stroke="#c98a62"
        strokeWidth={2.2}
        {...crease}
      />
      <g fill="#ffe7da" stroke="#141414" strokeWidth={2}>
        <rect x={62} y={76} width={13} height={9} rx={4.5} />
        <rect x={50} y={99} width={13} height={9} rx={4.5} />
        <rect x={58} y={118} width={12} height={8} rx={4} />
        <rect x={81} y={134} width={10} height={7} rx={3.5} />
      </g>
      <path d="M156 72 C184 68 210 70 232 78" stroke="#fff3e8" strokeWidth={7} opacity={0.8} {...crease} />
      <path d="M160 140 C190 142 216 140 238 134" stroke="#eba57d" strokeWidth={6} {...crease} />
      {/* 袖口とスーツの袖 */}
      <rect x={238} y={58} width={34} height={96} rx={6} fill="#fafafa" {...ink} />
      <rect x={250} y={100} width={10} height={13} rx={3} fill="#b0bec5" stroke="#141414" strokeWidth={2} />
      <path d="M268 48 L330 38 L330 174 L268 164 Z" fill="#263238" {...ink} />
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

  // 「ツッコミ」は 1 字ずつ落とし、「！！！」は詰めて並べ、遅れて叩きつける(ここで虹色に格上げ)。
  const glyphs = [..."ツッコミ！！！"].map((c, i) => ({
    c,
    x: i < 4 ? i * 250 : 1000 + (i - 4) * 120,
    delay: i < 4 ? 0.62 + i * 0.09 : 1.04 + (i - 4) * 0.06,
  }));
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
        {/* 横長の画面は 1 行、縦長(スマホ)は「ツッコミ」の下に「！！！」 */}
        <Word id="tkm" viewBox="-50 -150 1480 340" className="tk-word">
          {glyphs.map((g, i) => (
            <Ink key={i} id="tkm" text={g.c} x={g.x + 12} y={110} size={240} tone="gold" className="tk-glyph" style={{ animationDelay: `${g.delay}s` }} />
          ))}
        </Word>
        <Word id="tkv" viewBox="-50 -150 1100 640" className="tk-tall">
          {glyphs.map((g, i) => (
            <Ink
              key={i}
              id="tkv"
              text={g.c}
              x={i < 4 ? g.x + 12 : 200 + (i - 4) * 170}
              y={i < 4 ? 110 : 420}
              size={i < 4 ? 240 : 280}
              tone="gold"
              className="tk-glyph"
              style={{ animationDelay: `${g.delay}s` }}
            />
          ))}
        </Word>
      </div>
    </div>,
    document.body,
  );
}
