"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * お知らせを開いて既読にしたあと、画面を 1 回だけ取り直す。
 * サイドバーの未読の数(レイアウト側)は、ページを移っても計算し直されないため、
 * これがないと、読んだあとも古い数字が残る。取り直したあとは既読なので、もう描画されない(繰り返さない)。
 */
export function RefreshAfterRead() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
