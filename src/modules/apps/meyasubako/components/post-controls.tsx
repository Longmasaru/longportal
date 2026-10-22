"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { DictationButton } from "@/modules/core/shared/ui/dictation";
import { BUTTON_PRIMARY, FIELD_CLASS } from "@/modules/core/shared/ui/form";
import { addMessageAction, deletePostAction, markReadAction, setStatusAction } from "../actions";
import { PolishAssist } from "./polish-assist";
import { MESSAGE_MAX, MEYASUBAKO_STATUSES, STATUS_LABEL, type MeyasubakoStatus } from "../constants";

// 投稿の詳細ページの操作(返事・書き足し、状況の変更、削除、開いたことの記録)。

/** 開いたことを残す(未読の印を消す。返事をする人が開いた未読の投稿は「確認済み」になる)。 */
export function MarkRead({ postId }: { postId: string }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    markReadAction(postId)
      .then(() => router.refresh())
      .catch(() => {});
  }, [postId, router]);
  return null;
}

export function ReplyForm({ postId, asResponder }: { postId: string; asResponder: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setError("書く内容を入力してください。");
      return;
    }
    setError("");
    startTransition(async () => {
      const r = await addMessageAction(postId, body);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor="meyasubako-reply" className="text-brand01 text-sm font-bold">
          {asResponder ? "返事を書く" : "追加で伝える"}
        </label>
        <DictationButton onText={(t) => setBody((prev) => (prev ? `${prev}${t}` : t).slice(0, MESSAGE_MAX))} />
      </div>
      <textarea
        id="meyasubako-reply"
        rows={3}
        maxLength={MESSAGE_MAX}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={asResponder ? "投稿した人への返事" : "補足や、その後のことなど"}
        className={`${FIELD_CLASS} resize-y`}
      />
      <PolishAssist purpose="reply" text={body} onChange={setBody} max={MESSAGE_MAX} />
      {error ? (
        <p role="alert" className="text-brand03 text-sm font-bold">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`${BUTTON_PRIMARY} self-end`}>
        {pending ? "送っています…" : asResponder ? "返事を送る" : "送る"}
      </button>
    </form>
  );
}

export function StatusControl({ postId, status }: { postId: string; status: MeyasubakoStatus }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function change(next: MeyasubakoStatus) {
    if (next === status) return;
    setError("");
    startTransition(async () => {
      const r = await setStatusAction(postId, next);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-brand01 text-sm font-bold">対応の状況</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="対応の状況">
        {MEYASUBAKO_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending}
            aria-pressed={status === s}
            onClick={() => change(s)}
            className={
              "border px-3 py-1.5 text-sm font-bold transition-colors " +
              (status === s ? "bg-brand01 border-brand01 text-white" : "border-brand01/20 text-brand01 hover:border-brand03 bg-white")
            }
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-brand03 text-sm font-bold">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function DeletePostButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const r = await deletePostAction(postId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/apps/meyasubako?tab=inbox");
    });
  }

  return (
    <div className="text-brand04 flex flex-wrap items-center gap-2 text-xs">
      {confirming ? (
        <>
          <span>この投稿を削除しますか(元に戻せません。監査ログに残ります)</span>
          <button type="button" onClick={remove} disabled={pending} className="text-brand03 font-bold">
            削除する
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-brand01">
            やめる
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="hover:text-brand03">
          不適切な投稿を削除
        </button>
      )}
      {error ? <span className="text-brand03 font-bold">{error}</span> : null}
    </div>
  );
}
