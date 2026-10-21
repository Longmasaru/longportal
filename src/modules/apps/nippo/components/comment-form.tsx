"use client";

import { useActionState, useRef, useState } from "react";
import { DictationButton } from "@/modules/core/shared/ui/dictation";
import { BUTTON_PRIMARY, FIELD_CLASS, FormNotice } from "@/modules/core/shared/ui/form";
import { addCommentAction, deleteCommentAction } from "../actions";
import { COMMENT_MAX } from "../labels";
import type { FormState } from "../types";

/** コメントを書く欄(指導者はフィードバック、本人は返信)。 */
export function CommentForm({ reportId, isOwner }: { reportId: string; isOwner: boolean }) {
  const [body, setBody] = useState("");
  const bodyRef = useRef(body);
  const set = (next: string) => {
    bodyRef.current = next;
    setBody(next);
  };
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await addCommentAction(prev, formData);
    if (result?.ok) set("");
    return result;
  }, undefined);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="reportId" value={reportId} />
      <label htmlFor="nippo-comment" className="text-brand01 text-sm font-bold">
        {isOwner ? "返信する" : "コメントを書く"}
      </label>
      <textarea
        id="nippo-comment"
        name="body"
        rows={isOwner ? 3 : 5}
        maxLength={COMMENT_MAX}
        value={body}
        onChange={(e) => set(e.target.value)}
        placeholder={isOwner ? "コメントへのお礼や、聞きたいことなど" : "よかった点、次に意識すること、質問への答えなど"}
        className={`${FIELD_CLASS} resize-y`}
      />
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      <div className="flex flex-wrap items-start gap-2">
        <button type="submit" disabled={pending || !body.trim()} className={BUTTON_PRIMARY}>
          {pending ? "送っています…" : isOwner ? "返信を送る" : "コメントを送る"}
        </button>
        <DictationButton onText={(t) => set(`${bodyRef.current}${t}`)} />
      </div>
    </form>
  );
}

/** 自分のコメントを消すボタン。 */
export function DeleteCommentButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteCommentAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("このコメントを消しますか?")) e.preventDefault();
      }}
      className="self-end"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="text-brand04 hover:text-brand03 text-xs font-bold transition-colors">
        消す
      </button>
      {state?.error ? <span className="text-brand03 ml-2 text-xs font-bold">{state.error}</span> : null}
    </form>
  );
}
