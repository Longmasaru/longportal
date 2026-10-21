"use client";

import { useActionState } from "react";
import { acknowledgeRequestAction } from "../actions";

/** 届いた依頼の「確認しました」(ホームのお知らせ)。docs/DESIGN.md 41.3。 */
export function AcknowledgeButton({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState<{ error?: string } | undefined, FormData>(async () => {
    try {
      const result = await acknowledgeRequestAction(id);
      return result.ok ? undefined : { error: result.error };
    } catch {
      return { error: "確認できませんでした" };
    }
  }, undefined);
  return (
    <form action={action} className="flex items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        aria-label={`${label} の依頼を確認しました`}
        className="border-brand01 text-brand01 hover:border-brand03 hover:text-brand03 border bg-white px-3 py-1 text-sm font-bold transition-colors disabled:opacity-60"
      >
        {pending ? "送信中…" : "確認しました"}
      </button>
      {state?.error ? (
        <span role="alert" className="text-brand03 text-xs font-bold">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
