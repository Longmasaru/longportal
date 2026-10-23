"use client";

/** その人との LINE WORKS のトークを開く(新しいタブ。スマホは LINE WORKS のアプリが開く)。 */
export function TalkLink({ employeeId, name, compact }: { employeeId: string; name: string; compact: boolean }) {
  return (
    <a
      href={`/apps/soshikizu/talk/${employeeId}`}
      target="_blank"
      rel="noopener"
      draggable={false}
      // 札の開け閉めをさせない(押したらトークだけを開く)。
      onClick={(e) => e.stopPropagation()}
      aria-label={`${name} さんと LINE WORKS でトーク`}
      title="LINE WORKS でトーク"
      className={
        compact
          ? "text-brand01 hover:bg-brand01/10 hover:text-brand03 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          : "bg-brand01 hover:bg-brand03 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-white"
      }
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z" />
      </svg>
      {!compact && "LINE WORKS でトーク"}
    </a>
  );
}
