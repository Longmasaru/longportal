"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

// 目安箱に入れた瞬間の演出(docs/DESIGN.md 42 章)。本物の目安箱(享保の目安箱)に沿って、
// 書いた文が書状になり、くるくる巻かれて封をされ、木の目安箱の口へ「コトン」と入る。
// 最後に錠前が「カチャ」と閉まり、「たしかに受け取りました」。どこを押しても飛ばせる。
// 同じ投稿で 2 回目以降(再読み込みなど)は出さない。動きを減らす設定の人には、最後の文だけを静かに出す。

const DURATION_MS = 6200;
const TEXT_MAX = 72;

const CSS = `
.mb-scene{--mb-font:"Zen Antique","Yu Mincho","Hiragino Mincho ProN",serif;position:fixed;inset:0;z-index:100;overflow:hidden;cursor:pointer;background:radial-gradient(ellipse at 50% 30%,#fbf6ea 0%,#efe4cc 55%,#d9c7a3 100%);animation:mb-in .35s ease-out both,mb-out .5s ${DURATION_MS - 500}ms ease-in forwards}
.mb-scene::before{content:"";position:absolute;inset:0;opacity:.35;background:repeating-linear-gradient(90deg,transparent 0 3px,rgb(120 90 40 / .05) 3px 4px),repeating-linear-gradient(0deg,transparent 0 5px,rgb(120 90 40 / .04) 5px 6px)}
.mb-skip{position:absolute;top:max(12px,env(safe-area-inset-top));right:16px;z-index:5;border:1px solid rgb(60 40 20 / .35);background:rgb(255 255 255 / .7);color:#4a3520;font-size:.8rem;font-weight:700;padding:.35rem .8rem}
.mb-clip{position:absolute;left:0;right:0;top:0;bottom:calc(7vh + min(34vh,14rem) - 1.4rem);overflow:hidden;z-index:2}
.mb-paper-wrap{position:absolute;left:50%;top:5vh;translate:-50% 0;animation:mb-drop .55s 3.05s cubic-bezier(.55,0,.9,.4) forwards}
.mb-paper{position:relative;width:min(80vw,21rem);height:min(46vh,22rem);background:#fffdf6;border:1px solid #d8c9a6;box-shadow:0 .4rem 1.2rem rgb(80 60 30 / .18);transform-origin:100% 50%;animation:mb-roll .7s 2.05s cubic-bezier(.6,0,.4,1) forwards}
.mb-paper::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 2.1rem,rgb(190 160 110 / .18) 2.1rem calc(2.1rem + 1px))}
.mb-text{position:absolute;inset:1.1rem 1.2rem;writing-mode:vertical-rl;font-family:var(--mb-font);font-size:min(5.6vw,1.45rem);line-height:2.1rem;letter-spacing:.06em;color:#1d1a16;overflow:hidden;animation:mb-ink-out .25s 2.05s ease-in forwards}
.mb-text .mb-head{display:block;font-size:.8em;color:#7a5a32}
.mb-text span.c{opacity:0;animation:mb-ink .18s ease-out forwards}
.mb-scroll{position:absolute;top:0;right:-.2rem;width:2.4rem;height:min(46vh,22rem);opacity:0;border-radius:1.2rem/.5rem;background:linear-gradient(90deg,#d9cba8 0%,#fffaf0 35%,#fffdf6 55%,#cbb88f 100%);box-shadow:0 .3rem .8rem rgb(80 60 30 / .25);animation:mb-show .2s 2.55s forwards,mb-center .3s 2.75s ease-in-out forwards}
.mb-seal{position:absolute;left:-.15rem;right:-.15rem;top:42%;height:2.6rem;display:grid;place-items:center;background:#b3261e;color:#fff4e0;font-family:var(--mb-font);font-size:1.1rem;opacity:0;scale:1.8;animation:mb-seal .3s 2.7s cubic-bezier(.2,1.6,.4,1) forwards}
.mb-box{position:absolute;left:50%;bottom:7vh;translate:-50% 0;width:min(64vw,16rem);height:min(34vh,14rem);z-index:3;animation:mb-bump .45s 3.55s ease-out both}
.mb-lid{position:absolute;left:-7%;right:-7%;top:0;height:22%;background:linear-gradient(180deg,#7a4a22,#5c3416);clip-path:polygon(6% 100%,0 55%,10% 0,90% 0,100% 55%,94% 100%)}
.mb-slot{position:absolute;left:50%;top:38%;width:46%;height:.55rem;translate:-50% 0;background:#1b0f06;border-radius:.2rem;box-shadow:inset 0 .15rem .2rem #000}
.mb-body{position:absolute;left:0;right:0;top:20%;bottom:0;background:repeating-linear-gradient(90deg,rgb(0 0 0 / .05) 0 2px,transparent 2px 11px),linear-gradient(180deg,#9b6533,#7c4b22);border:2px solid #4e2c10}
.mb-label{position:absolute;left:50%;top:7%;translate:-50% 0;padding:.5rem .35rem;background:#f6efdc;border:1px solid #c9b48a;writing-mode:vertical-rl;font-family:var(--mb-font);font-size:min(5.4vw,1.4rem);letter-spacing:.2em;color:#1d1a16;-webkit-text-stroke:.03em currentColor}
.mb-lock{position:absolute;left:50%;bottom:6%;translate:-50% 0;width:2.2rem;height:1.8rem;background:linear-gradient(180deg,#d8b35a,#a87e2a);border:1px solid #6d4f12;border-radius:.25rem}
.mb-lock::before{content:"";position:absolute;left:.4rem;right:.4rem;bottom:100%;height:1.2rem;border:.28rem solid #8c8c8c;border-bottom:0;border-radius:.9rem .9rem 0 0;translate:0 -.55rem;animation:mb-shackle .2s 4.15s cubic-bezier(.3,1.8,.5,1) forwards}
.mb-lock::after{content:"";position:absolute;left:50%;top:40%;width:.3rem;height:.6rem;translate:-50% 0;background:#3a2a08;border-radius:.15rem}
.mb-sfx{position:absolute;z-index:4;font-family:var(--mb-font);color:#3a2410;font-size:min(9vw,2.6rem);opacity:0;white-space:nowrap}
.mb-koton{right:calc(50% + min(18vw,4.5rem));bottom:calc(7vh + min(34vh,14rem) + .2rem);rotate:-8deg;animation:mb-pop 1s 3.5s ease-out forwards}
.mb-kacha{left:calc(50% + 1.8rem);bottom:calc(7vh + min(4vh,1.5rem));font-size:min(6vw,1.6rem);rotate:-6deg;animation:mb-pop 1s 4.15s ease-out forwards}
.mb-done{position:absolute;left:0;right:0;top:12vh;z-index:4;text-align:center;opacity:0;animation:mb-rise .6s 4.45s ease-out forwards}
.mb-done p:first-child{font-family:var(--mb-font);font-size:min(8.2vw,2.6rem);white-space:nowrap;color:#1d1a16;line-height:1.3;-webkit-text-stroke:.03em currentColor}
.mb-done p:last-child{margin-top:.6rem;font-size:.85rem;color:#5a4630}
@keyframes mb-in{from{opacity:0}}
@keyframes mb-out{to{opacity:0;visibility:hidden}}
@keyframes mb-ink{from{opacity:0;filter:blur(2px)}to{opacity:1;filter:none}}
@keyframes mb-ink-out{to{opacity:0}}
@keyframes mb-roll{to{transform:scaleX(.1);opacity:0}}
@keyframes mb-show{to{opacity:1}}
@keyframes mb-center{to{right:calc(min(80vw,21rem) / 2 - 1.2rem)}}
@keyframes mb-seal{to{opacity:1;scale:1}}
@keyframes mb-drop{to{translate:-50% 115vh}}
@keyframes mb-bump{0%,100%{transform:translateY(0) scale(1)}30%{transform:translateY(.35rem) scale(1.03,.96)}60%{transform:translateY(-.15rem) scale(.99,1.01)}}
@keyframes mb-pop{0%{opacity:0;scale:.4}25%{opacity:1;scale:1.1}70%{opacity:1;scale:1}100%{opacity:0;scale:1}}
@keyframes mb-shackle{to{translate:0 0}}
@keyframes mb-rise{from{opacity:0;translate:0 .8rem}to{opacity:1;translate:0 0}}
@media (prefers-reduced-motion:reduce){
.mb-scene{animation:mb-out .4s 2.6s ease-in forwards}
.mb-clip,.mb-sfx{display:none}
.mb-box,.mb-lock::before{animation:none;translate:-50% 0}
.mb-lock::before{translate:0 0}
.mb-done{animation:none;opacity:1}
}`;

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > TEXT_MAX ? `${flat.slice(0, TEXT_MAX)}…` : flat;
}

export function ToukanScene({ postId, text, heading }: { postId: string; text: string; heading: string }) {
  const storageKey = `meyasubako:toukan:${postId}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(storageKey) === "1";
    } catch {
      // 保存できない端末でも、演出は出す(毎回出るだけ)。
    }
    if (seen) return;
    // 書状の描画は document が要るので、画面に出たあとで始める。
    const start = window.setTimeout(() => {
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch {
        // 保存できなくても演出は出す。
      }
      setShow(true);
    }, 0);
    const timer = window.setTimeout(() => setShow(false), DURATION_MS);
    // 対応している端末(Android など)では、「コトン」と「カチャ」で震わせる。
    const koton = window.setTimeout(() => navigator.vibrate?.(40), 3550);
    const kacha = window.setTimeout(() => navigator.vibrate?.([20, 40, 20]), 4150);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timer);
      window.clearTimeout(koton);
      window.clearTimeout(kacha);
    };
  }, [storageKey]);

  const close = useCallback(() => setShow(false), []);
  if (!show) return null;

  const chars = [...shorten(text)];
  const step = Math.min(0.06, 1.3 / Math.max(chars.length, 1));

  return createPortal(
    <div className="mb-scene" role="status" aria-label="目安箱に入れました。たしかに受け取りました。" onClick={close}>
      <style>{CSS}</style>
      <button type="button" className="mb-skip" onClick={close}>
        とばす
      </button>
      <div className="mb-clip" aria-hidden="true">
        <div className="mb-paper-wrap">
          <div className="mb-paper">
            <div className="mb-text">
              <span className="mb-head">{heading}</span>
              {chars.map((c, i) => (
                <span key={i} className="c" style={{ animationDelay: `${0.45 + i * step}s` }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="mb-scroll">
            <div className="mb-seal">封</div>
          </div>
        </div>
      </div>
      <div className="mb-box" aria-hidden="true">
        <div className="mb-lid">
          <div className="mb-slot" />
        </div>
        <div className="mb-body">
          <div className="mb-label">目安箱</div>
          <div className="mb-lock" />
        </div>
      </div>
      <div className="mb-sfx mb-koton" aria-hidden="true">
        コトン
      </div>
      <div className="mb-sfx mb-kacha" aria-hidden="true">
        カチャ
      </div>
      <div className="mb-done" aria-hidden="true">
        <p>たしかに受け取りました</p>
        <p>返事はホームと「わたしの投稿」でお知らせします</p>
      </div>
    </div>,
    document.body,
  );
}
