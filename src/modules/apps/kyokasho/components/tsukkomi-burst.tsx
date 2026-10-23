"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// ツッコミを送った瞬間の演出(docs/DESIGN.md 32 章)。パチンコの激アツ演出のように、画面いっぱいに
// 裏手が「ビッシィィィ!」と入って「ツッコミィィィ‼」「なんでやねん!!」と出る。押しても下の画面を邪魔しない(pointer-events なし)。
// 動きを減らす設定の人には、文字だけを静かに出す。
const DURATION_MS = 2800;

const CSS = `
.tk-burst{position:fixed;inset:0;z-index:100;pointer-events:none;overflow:hidden;display:grid;place-items:center;animation:tk-out ${DURATION_MS}ms ease-in forwards}
.tk-flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,#fff8d6 0%,#ffd54f 22%,#ff6d00 48%,#c62828 72%,#4a0000 100%);animation:tk-flash ${DURATION_MS}ms ease-out forwards}
.tk-rays{position:absolute;left:50%;top:50%;width:300vmax;height:300vmax;margin:-150vmax 0 0 -150vmax;background:repeating-conic-gradient(rgb(255 255 255 / .38) 0deg 6deg,transparent 6deg 15deg);animation:tk-spin 2.4s linear infinite;mix-blend-mode:screen}
.tk-lines{position:absolute;inset:-10%;background:repeating-conic-gradient(from 3deg,rgb(0 0 0 / .55) 0deg .7deg,transparent .7deg 9deg);-webkit-mask:radial-gradient(circle,transparent 34%,#000 62%);mask:radial-gradient(circle,transparent 34%,#000 62%);animation:tk-jitter .09s steps(2) infinite}
.tk-stage{position:relative;display:flex;flex-direction:column;align-items:center;gap:.2em;transform:rotate(-7deg);animation:tk-shake .5s .32s both}
.tk-main,.tk-tail{font-weight:900;font-style:italic;line-height:1;letter-spacing:-.02em;white-space:nowrap;color:#fff;background:linear-gradient(180deg,#fffde7 0%,#ffee58 38%,#ffb300 60%,#ff6f00 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;-webkit-text-stroke:.045em #b71c1c;paint-order:stroke fill;filter:drop-shadow(0 .05em 0 #4a0000) drop-shadow(0 0 .12em rgb(255 255 255 / .9)) drop-shadow(0 0 .35em #ff3d00)}
.tk-main{font-size:min(21vw,13rem);animation:tk-slam .42s .3s cubic-bezier(.2,1.6,.4,1) both}
.tk-tail{margin-top:.35em;font-size:min(6.6vw,4.2rem);letter-spacing:-.1em;animation:tk-stretch .6s .55s cubic-bezier(.2,1.4,.4,1) both;transform-origin:left center}
.tk-tail span{display:inline-block;animation:tk-hop .5s ease-in-out infinite alternate}
.tk-hand{position:absolute;left:50%;top:50%;font-size:min(46vw,20rem);line-height:1;font-style:normal;filter:drop-shadow(0 .03em 0 #4a0000);animation:tk-slap .34s cubic-bezier(.7,0,.9,.5) both,tk-recoil .5s .34s ease-out both}
.tk-sfx,.tk-nande{font-weight:900;font-style:italic;line-height:1;white-space:nowrap;color:#fff;-webkit-text-stroke:.09em #111;paint-order:stroke fill;text-shadow:.06em .06em 0 #111}
.tk-sfx{font-size:min(8.5vw,5rem);transform:rotate(-4deg);animation:tk-pop .3s .3s cubic-bezier(.2,1.8,.4,1) both}
.tk-nande{margin-top:.3em;font-size:min(9.5vw,5.4rem);color:#ffeb3b;animation:tk-pop .45s 1s cubic-bezier(.2,1.8,.4,1) both}
.tk-hit{position:absolute;left:50%;top:50%;width:min(110vw,56rem);aspect-ratio:1;margin:calc(min(110vw,56rem) / -2) 0 0 calc(min(110vw,56rem) / -2);border-radius:50%;border:min(4vw,1.6rem) solid #fff;animation:tk-ring .5s .3s ease-out both}
@keyframes tk-flash{0%,12%{opacity:0}16%{opacity:1;filter:brightness(2.2)}26%{filter:brightness(1)}100%{opacity:1}}
@keyframes tk-spin{to{transform:rotate(360deg)}}
@keyframes tk-jitter{to{transform:rotate(2deg) scale(1.02)}}
@keyframes tk-slam{0%{opacity:0;transform:scale(4) rotate(12deg)}60%{opacity:1;transform:scale(.88)}100%{opacity:1;transform:scale(1)}}
@keyframes tk-stretch{0%{opacity:0;transform:scaleX(.1)}100%{opacity:1;transform:scaleX(1)}}
@keyframes tk-hop{to{transform:translateY(-.12em)}}
@keyframes tk-shake{0%,100%{translate:0 0}15%{translate:-4% 3%}30%{translate:5% -3%}45%{translate:-3% -2%}60%{translate:3% 2%}75%{translate:-1% 1%}}
@keyframes tk-slap{0%{opacity:0;transform:translate(70%,-50%) rotate(-60deg)}30%{opacity:1}100%{opacity:1;transform:translate(-55%,-50%) rotate(-100deg)}}
@keyframes tk-recoil{0%{transform:translate(-55%,-50%) rotate(-100deg)}100%{opacity:0;transform:translate(10%,-58%) rotate(-80deg) scale(1.1)}}
@keyframes tk-pop{0%{opacity:0;scale:.2}100%{opacity:1;scale:1}}
@keyframes tk-ring{0%{opacity:1;transform:scale(.15)}100%{opacity:0;transform:scale(1.4)}}
@keyframes tk-out{0%,82%{opacity:1}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){
.tk-burst{animation:tk-out ${DURATION_MS}ms linear forwards}
.tk-rays,.tk-lines,.tk-hand,.tk-hit{display:none}
.tk-flash{animation:none;opacity:.92}
.tk-stage,.tk-main,.tk-tail,.tk-tail span,.tk-sfx,.tk-nande{animation:none}
}`;

const TAIL = "ィィィイイイイイ‼！！！！！！";

export function TsukkomiBurst({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, DURATION_MS);
    // 対応している端末(Android など)では、叩いた瞬間に震わせる。
    const buzz = window.setTimeout(() => navigator.vibrate?.([40, 30, 90]), 300);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(buzz);
    };
  }, [onDone]);

  return createPortal(
    <div className="tk-burst" role="status" aria-label="ツッコミを送りました">
      <style>{CSS}</style>
      <div className="tk-flash" />
      <div className="tk-rays" />
      <div className="tk-lines" />
      <div className="tk-hit" />
      <div className="tk-hand" aria-hidden="true">
        🤚
      </div>
      <div className="tk-stage" aria-hidden="true">
        <div className="tk-sfx">ビッシィィィイイ！！</div>
        <div className="tk-main">ツッコミ</div>
        <div className="tk-tail">
          {[...TAIL].map((c, i) => (
            <span key={i} style={{ animationDelay: `${(i % 4) * 0.06}s` }}>
              {c}
            </span>
          ))}
        </div>
        <div className="tk-nande">なんでやねん！！！！</div>
      </div>
    </div>,
    document.body,
  );
}
