"use client";

import { useEffect, useRef, useState } from "react";

/** 顔写真(LINE WORKS のアイコン)。写真がない・取れないときは、名字の 1 文字を丸に出す。 */
export function Avatar({ employeeId, name, withPhoto }: { employeeId: string; name: string; withPhoto: boolean }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // 画面の準備より先に読み込みに失敗していると onError が届かないので、準備ができた時点でも確かめる。
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (withPhoto && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 本人のブラウザに覚えさせた写真をそのまま出す(画像の最適化は通さない)
      <img
        ref={ref}
        src={`/apps/soshikizu/photos/${employeeId}`}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        onError={() => setFailed(true)}
        className="bg-brand01/10 size-10 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="bg-brand01 flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
    >
      {name.slice(0, 1)}
    </span>
  );
}
