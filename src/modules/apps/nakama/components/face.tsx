"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * 顔写真(LINE WORKS のアイコン)。写真がない・取れないときは、名前の 1 文字を出す。
 * 印刷用(eager)は、印刷の前に読み込み終わるよう遅延読み込みにしない。
 */
export function Face({
  employeeId,
  name,
  withPhoto,
  eager = false,
  className,
  letterClassName,
  style,
}: {
  employeeId: string;
  name: string;
  withPhoto: boolean;
  eager?: boolean;
  className: string;
  letterClassName: string;
  style?: CSSProperties;
}) {
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
        src={`/apps/nakama/photos/${employeeId}`}
        alt=""
        loading={eager ? "eager" : "lazy"}
        onError={() => setFailed(true)}
        className={`bg-brand01/10 object-cover ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`bg-brand01 flex items-center justify-center font-bold text-white ${className} ${letterClassName}`}
      style={style}
    >
      {name.slice(0, 1)}
    </span>
  );
}
