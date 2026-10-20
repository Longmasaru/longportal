"use client";

import { useActionState } from "react";
import { BUTTON_SECONDARY, FormNotice } from "@/modules/core/shared/ui/form";
import { syncBookAction, type SyncFormState } from "../sync-actions";

/** 「今すぐ取り込む」。元の Google ドキュメントから、定時の同期を待たずに取り込み直す。 */
export function SyncButton({ bookId }: { bookId: string }) {
  const [state, action, pending] = useActionState<SyncFormState, FormData>(syncBookAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={bookId} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON_SECONDARY}>
          {pending ? "取り込み中…(大きな教科書は数分かかります)" : "今すぐ取り込む"}
        </button>
      </div>
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}
    </form>
  );
}
