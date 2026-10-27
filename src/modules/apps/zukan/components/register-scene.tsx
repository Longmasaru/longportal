"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

// 図鑑に登録した瞬間の演出(docs/DESIGN.md 44 章)。白い紙の上で、ビフォーの写真がアフターへ
// 拭き取られるように切り替わり、ページの番号の判が「ポン」と押される。
// 寒くならないように: 言葉は少なく(番号と名前と「図鑑に載りました」だけ)、効果音の文字や紙吹雪は使わない。
// 同じページで 2 回目以降は出さない。どこを押しても飛ばせる。動きを減らす設定の人には、最後の画面だけを静かに出す。

const DURATION_MS = 4600;

const CSS = `
.zr-scene{position:fixed;inset:0;z-index:100;display:grid;place-items:center;cursor:pointer;background:#f4f6fa;animation:zr-in .3s ease-out both,zr-out .45s ${DURATION_MS - 450}ms ease-in forwards}
.zr-skip{position:absolute;top:max(12px,env(safe-area-inset-top));right:16px;border:1px solid rgb(0 60 150 / .3);background:#fff;color:#003c96;font-size:.8rem;font-weight:700;padding:.35rem .8rem}
.zr-page{position:relative;width:min(84vw,22rem);background:#fff;border:1px solid rgb(0 60 150 / .2);padding:1rem 1rem 1.2rem;animation:zr-page .5s ease-out both}
.zr-photo{position:relative;aspect-ratio:4/3;overflow:hidden;background:#e9edf4}
.zr-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.zr-before{clip-path:inset(0 0 0 0);animation:zr-wipe .9s .9s cubic-bezier(.65,0,.35,1) forwards}
.zr-edge{position:absolute;top:0;bottom:0;left:100%;width:2px;background:#fff;animation:zr-edge .9s .9s cubic-bezier(.65,0,.35,1) forwards}
.zr-tag{position:absolute;top:.5rem;padding:0 .45rem;font-size:.7rem;line-height:1.4rem;font-weight:700;letter-spacing:.15em}
.zr-tag-b{left:.5rem;background:rgb(255 255 255 / .9);color:#5c6b84;animation:zr-fade .3s 1.5s forwards}
.zr-tag-a{right:.5rem;background:#003c96;color:#fff;opacity:0;animation:zr-show .3s 1.6s forwards}
.zr-meta{margin-top:.9rem;display:flex;align-items:baseline;justify-content:space-between;gap:.75rem}
.zr-title{color:#003c96;font-weight:700;font-size:1rem;line-height:1.4;opacity:0;animation:zr-rise .4s 2s ease-out forwards}
.zr-stamp{flex-shrink:0;border:2px solid #e67150;color:#e67150;padding:.1rem .5rem;font-weight:700;letter-spacing:.08em;font-variant-numeric:tabular-nums;rotate:-6deg;opacity:0;scale:1.9;animation:zr-stamp .28s 2.35s cubic-bezier(.2,1.5,.4,1) forwards}
.zr-done{margin-top:1.1rem;text-align:center;color:#003c96;font-size:.95rem;font-weight:700;opacity:0;animation:zr-rise .45s 2.8s ease-out forwards}
.zr-done small{display:block;margin-top:.25rem;color:#5c6b84;font-size:.75rem;font-weight:400}
@keyframes zr-in{from{opacity:0}}
@keyframes zr-out{to{opacity:0;visibility:hidden}}
@keyframes zr-page{from{opacity:0;translate:0 .8rem}}
@keyframes zr-wipe{to{clip-path:inset(0 0 0 100%)}}
@keyframes zr-edge{from{left:0}to{left:100%}}
@keyframes zr-fade{to{opacity:0}}
@keyframes zr-show{to{opacity:1}}
@keyframes zr-rise{from{opacity:0;translate:0 .4rem}to{opacity:1;translate:0 0}}
@keyframes zr-stamp{to{opacity:1;scale:1}}
@media (prefers-reduced-motion:reduce){
.zr-scene{animation:zr-out .4s 2.4s ease-in forwards}
.zr-page,.zr-title,.zr-stamp,.zr-done,.zr-tag-a{animation:none;opacity:1;scale:1}
.zr-before,.zr-edge,.zr-tag-b{display:none}
}`;

export function RegisterScene({
  entryId,
  numberLabel,
  title,
  beforeSrc,
  afterSrc,
}: {
  entryId: string;
  numberLabel: string;
  title: string;
  beforeSrc: string | null;
  afterSrc: string | null;
}) {
  const storageKey = `zukan:register:${entryId}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(storageKey) === "1";
    } catch {
      // 保存できない端末でも、演出は出す(毎回出るだけ)。
    }
    if (seen) return;
    const start = window.setTimeout(() => {
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch {
        // 保存できなくても演出は出す。
      }
      setShow(true);
    }, 0);
    const timer = window.setTimeout(() => setShow(false), DURATION_MS);
    const stamp = window.setTimeout(() => navigator.vibrate?.(30), 2400);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timer);
      window.clearTimeout(stamp);
    };
  }, [storageKey]);

  const close = useCallback(() => setShow(false), []);
  if (!show) return null;

  return createPortal(
    <div className="zr-scene" role="status" aria-label={`${numberLabel}「${title}」が図鑑に載りました。`} onClick={close}>
      <style>{CSS}</style>
      <button type="button" className="zr-skip" onClick={close}>
        とばす
      </button>
      <div className="zr-page" aria-hidden="true">
        <div className="zr-photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- 見られる人だけ R2 へ転送する入口の画像 */}
          {afterSrc ? <img src={afterSrc} alt="" /> : null}
          <div className="zr-before" style={{ position: "absolute", inset: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 見られる人だけ R2 へ転送する入口の画像 */}
            {beforeSrc ? <img src={beforeSrc} alt="" /> : null}
          </div>
          <div className="zr-edge" />
          <span className="zr-tag zr-tag-b">BEFORE</span>
          <span className="zr-tag zr-tag-a">AFTER</span>
        </div>
        <div className="zr-meta">
          <p className="zr-title">{title}</p>
          <p className="zr-stamp">{numberLabel}</p>
        </div>
        <p className="zr-done">
          図鑑に載りました
          <small>点数とレア度は、鑑定のあとに開きます</small>
        </p>
      </div>
    </div>,
    document.body,
  );
}
