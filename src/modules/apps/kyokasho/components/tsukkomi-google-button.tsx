"use client";

import { useActionState } from "react";
import { BUTTON_SECONDARY, FormNotice } from "@/modules/core/shared/ui/form";
import { pushCommentsToGoogleAction, type GooglePushFormState } from "../tsukkomi-actions";

/** 「これまでのツッコミも Google ドキュメントに付ける」。付いているものは飛ばすので、何度押してもよい。 */
export function GooglePushButton() {
  const [state, action, pending] = useActionState<GooglePushFormState>(pushCommentsToGoogleAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON_SECONDARY}>
          {pending ? "付けています…" : "これまでのツッコミも Google ドキュメントに付ける"}
        </button>
        <p className="text-brand04 text-xs">新しいツッコミは、書かれたときに自動で付きます。付いているものは飛ばします。</p>
      </div>
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}
    </form>
  );
}
