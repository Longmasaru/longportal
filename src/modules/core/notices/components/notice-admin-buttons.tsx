"use client";

import { useActionState } from "react";
import { BUTTON_SECONDARY, FormNotice } from "../../shared/ui/form";
import { deleteNoticeAction, unpublishNoticeAction, type NoticeFormState } from "../actions";

/** 公開中 → 下書きに戻す / 下書き → 削除。 */
export function NoticeAdminButtons({ id, status }: { id: string; status: "draft" | "published" }) {
  const [unpubState, unpublish, unpubPending] = useActionState<NoticeFormState, FormData>(
    unpublishNoticeAction,
    undefined,
  );
  const [delState, remove, delPending] = useActionState<NoticeFormState, FormData>(deleteNoticeAction, undefined);
  const state = unpubState ?? delState;

  return (
    <div className="flex flex-col gap-2">
      {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}
      {status === "published" ? (
        <form action={unpublish}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={unpubPending} className={BUTTON_SECONDARY}>
            下書きに戻す(非公開にする)
          </button>
        </form>
      ) : (
        <form
          action={remove}
          onSubmit={(e) => {
            if (!window.confirm("この下書きを削除します。元に戻せません。よろしいですか?")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={delPending} className={BUTTON_SECONDARY}>
            下書きを削除
          </button>
        </form>
      )}
    </div>
  );
}
