"use client";

import { useActionState, type FormEvent } from "react";
import { BUTTON_SECONDARY, FormNotice } from "@/modules/core/shared/ui/form";
import { deleteBotAction, trialSendAction, type BotFormState } from "../actions";

/** 「試しに送る」と「消す」。 */
export function BotButtons({ botId, name }: { botId: string; name: string }) {
  const [trial, trialAction, trialPending] = useActionState<BotFormState, FormData>(trialSendAction, undefined);
  const [del, deleteAction, deletePending] = useActionState<BotFormState, FormData>(deleteBotAction, undefined);
  const confirmDelete = (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(`「${name}」を消します。実行の記録も消えます。よろしいですか?`)) event.preventDefault();
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <form action={trialAction}>
          <input type="hidden" name="id" value={botId} />
          <button type="submit" disabled={trialPending} className={BUTTON_SECONDARY}>
            {trialPending ? "送っています…" : "試しに送る"}
          </button>
        </form>
        <form action={deleteAction} onSubmit={confirmDelete}>
          <input type="hidden" name="id" value={botId} />
          <button type="submit" disabled={deletePending} className={BUTTON_SECONDARY}>
            {deletePending ? "消しています…" : "消す"}
          </button>
        </form>
      </div>
      {trial?.error ? <FormNotice tone="error">{trial.error}</FormNotice> : null}
      {trial?.success ? <FormNotice tone="success">{trial.success}</FormNotice> : null}
      {del?.error ? <FormNotice tone="error">{del.error}</FormNotice> : null}
    </div>
  );
}
