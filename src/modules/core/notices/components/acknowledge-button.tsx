"use client";

import { useActionState } from "react";
import { BUTTON_PRIMARY, FormNotice } from "../../shared/ui/form";
import { acknowledgeNoticeAction, type NoticeFormState } from "../actions";

/** 「確認しました」ボタン。確認済みなら表示だけ。 */
export function AcknowledgeButton({ id, acknowledged }: { id: string; acknowledged: boolean }) {
  const [state, action, pending] = useActionState<NoticeFormState, FormData>(acknowledgeNoticeAction, undefined);
  if (acknowledged) {
    return <FormNotice tone="success">このお知らせは確認済みです。</FormNotice>;
  }
  return (
    <form action={action} className="border-brand03 bg-brand03/10 flex flex-wrap items-center gap-4 border-l-4 px-4 py-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-brand01 flex-1 text-sm font-bold">このお知らせは、内容を確認したら「確認しました」を押してください。</p>
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
        {pending ? "送信中…" : "確認しました"}
      </button>
    </form>
  );
}
