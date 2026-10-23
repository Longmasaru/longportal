"use client";

/** 印刷のボタン(A4 縦 1 枚に、いま表示している人をまとめる)。 */
export function PrintButton({ disabled }: { disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      disabled={disabled}
      className="bg-brand01 px-6 py-3 text-lg font-bold tracking-[0.1em] text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
    >
      印刷する(A4 1 枚)
    </button>
  );
}
