"use client";

import { useState } from "react";

/** 「ドキュメント用にコピー」。日報まとめ(Google ドキュメント)の様式の文章をクリップボードに入れる。 */
export function CopyDocButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("failed");
    }
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={copy}
        className="border-brand01 text-brand01 hover:text-brand03 hover:border-brand03 border bg-white px-4 py-2 text-sm font-bold transition-colors"
      >
        ドキュメント用にコピー
      </button>
      <p role="status" className="text-brand04 text-xs">
        {state === "done" ? "コピーしました。ドキュメントに貼ってください。" : state === "failed" ? "コピーできませんでした。" : null}
      </p>
    </div>
  );
}
