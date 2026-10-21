"use client";

import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, LABEL_CLASS, StatusTag } from "@/modules/core/shared/ui/form";
import { createRequestAction, updateRequestAction, withdrawRequestAction, type RequestInput } from "../actions";
import type { AssigneeOption, SentRequestRow } from "../queries";
import { REQUEST_STATE_LABEL, personLabel, type RequestState } from "../requests";
import { DUE_TONE_CLASS, describeDueDate } from "./format";

// 「頼んだこと」: ほかの社員に TODO を頼む・頼んだものの状態を見る(docs/DESIGN.md 41 章)。

const STATE_TONE: Record<RequestState, "info" | "neutral" | "attention"> = {
  open: "info",
  done: "neutral",
  returned: "attention",
};

type Message = (message: string, tone?: "success" | "error") => void;

/** 送信の結果。誤りの文言は Server Action が { error } で返したもの(画面に出してよいもの)。 */
type SubmitResult = { error?: string };

export function RequestPanel({
  sent,
  setSent,
  assignees,
  today,
  onMessage,
}: {
  /** 頼んだ依頼(タブを切り替えても消えないよう、親が持つ) */
  sent: SentRequestRow[];
  setSent: Dispatch<SetStateAction<SentRequestRow[]>>;
  assignees: AssigneeOption[];
  today: string;
  onMessage: Message;
}) {
  const [editing, setEditing] = useState<SentRequestRow | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [showDone, setShowDone] = useState(false);

  const active = sent.filter((r) => r.state !== "done");
  const done = sent.filter((r) => r.state === "done");

  const withdraw = async (r: SentRequestRow) => {
    if (!window.confirm(`「${r.text}」の依頼を取り下げますか?(${personLabel(r.assigneeName)}の TODO からも消えます)`))
      return;
    try {
      const result = await withdrawRequestAction(r.id);
      if (!result.ok) return onMessage(result.error, "error");
      setSent((prev) => prev.filter((x) => x.id !== r.id));
      onMessage("取り下げました");
    } catch {
      onMessage("取り下げられませんでした", "error");
    }
  };

  const renderItem = (r: SentRequestRow) => {
    const due = r.dueDate ? describeDueDate(r.dueDate, today) : null;
    return (
      <li key={r.id} className="border-brand04/40 border-b py-3 first:border-t">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusTag tone={STATE_TONE[r.state]}>{REQUEST_STATE_LABEL[r.state]}</StatusTag>
          <span
            className={`font-bold [overflow-wrap:anywhere] ${r.state === "done" ? "text-brand04 line-through" : "text-brand01"}`}
          >
            {r.text}
          </span>
          <span className="text-brand04 text-sm">{personLabel(r.assigneeName)}へ</span>
          {due ? (
            <span
              className={`text-sm ${r.state === "open" ? DUE_TONE_CLASS[due.tone] : "text-brand04"}`}
              title={r.dueDate}
            >
              期限 {due.label}
            </span>
          ) : null}
          {r.state === "open" ? (
            <span className="text-brand04 text-xs">
              {r.acknowledged ? "相手は確認済み" : "相手はまだ確認していません"}
            </span>
          ) : null}
        </div>
        {r.description ? (
          <p className="text-brand04 mt-1 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
            {r.description}
          </p>
        ) : null}
        {r.state === "returned" ? (
          <p className="border-brand03 bg-brand03/10 text-brand01 mt-2 border-l-4 px-3 py-2 text-sm [overflow-wrap:anywhere]">
            お返しされました{r.returnedReason ? `: ${r.returnedReason}` : "(ひとことはありません)"}
          </p>
        ) : null}
        {r.state !== "done" ? (
          <div className="mt-2 flex gap-4 text-sm">
            <button
              type="button"
              onClick={() => setEditing(r)}
              className="text-brand01 hover:text-brand03 font-bold transition-colors"
            >
              {r.state === "returned" ? "直して頼み直す" : "変更"}
            </button>
            <button
              type="button"
              onClick={() => void withdraw(r)}
              className="text-brand04 hover:text-brand03 font-bold transition-colors"
            >
              取り下げる
            </button>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-bg01 flex flex-col gap-3 p-4">
        <p className="text-brand01 font-bold">ほかの人に頼む</p>
        <p className="text-brand04 -mt-2 text-sm">
          頼んだ相手の TODO に「あなたの名前から」の印つきで入り、ホームにお知らせが出ます。見られるのは、あなたと相手の
          2 人だけです。
        </p>
        <RequestForm
          key={formKey}
          assignees={assignees}
          submitLabel="頼む"
          onSubmit={async (input) => {
            const result = await createRequestAction(input);
            if (!result.ok) return { error: result.error };
            const created = result.value;
            setSent((prev) => [created, ...prev]);
            setFormKey((k) => k + 1);
            onMessage(`${personLabel(created.assigneeName)}に頼みました`);
            return {};
          }}
        />
      </div>

      {active.length === 0 ? (
        <p className="bg-bg01 text-brand04 px-6 py-12 text-center text-sm">頼んでいることはありません</p>
      ) : (
        <ul>{active.map(renderItem)}</ul>
      )}

      {done.length > 0 ? (
        <section aria-label="完了した依頼" className="bg-bg01 p-4">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="group flex w-full items-center justify-between text-left"
          >
            <span className="text-brand01 font-bold">完了した依頼({done.length})</span>
            <span className="text-brand01 group-hover:text-brand03 text-xl transition-colors">
              {showDone ? "⌃" : "⌄"}
            </span>
          </button>
          {showDone ? <ul className="mt-4 bg-white px-3">{done.map(renderItem)}</ul> : null}
        </section>
      ) : null}

      {editing ? (
        <div
          className="bg-brand01/50 fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
          onClick={() => setEditing(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="todo-request-edit-title"
            className="border-brand01 max-h-full w-full max-w-xl overflow-y-auto border-t-8 bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="todo-request-edit-title" className="flex items-baseline gap-3">
              <span className="font-heading text-brand01 text-2xl font-black tracking-wider">REQUEST</span>
              <span className="text-brand04 text-sm tracking-[0.2em]">
                {editing.state === "returned" ? "直して頼み直す" : "依頼を変更"}
              </span>
            </h2>
            <p className="text-brand04 mt-2 text-sm">
              {editing.state === "returned"
                ? "保存すると、未完了に戻して相手にもう一度お知らせします。"
                : "内容を変えると、相手のホームにもう一度お知らせが出ます。"}
            </p>
            <div className="mt-6">
              <RequestForm
                assignees={assignees}
                initial={editing}
                submitLabel={editing.state === "returned" ? "頼み直す" : "保存する"}
                onCancel={() => setEditing(null)}
                onSubmit={async (input) => {
                  const result = await updateRequestAction(editing.id, input);
                  if (!result.ok) return { error: result.error };
                  const updated = result.value;
                  setSent((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                  setEditing(null);
                  onMessage(editing.state === "returned" ? "頼み直しました" : "保存しました");
                  return {};
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 依頼の入力欄(相手・タスク名・メモ・期限)。相手はカレンダーの呼びかけと同じく、絞り込んで選ぶ。 */
function RequestForm({
  assignees,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  assignees: AssigneeOption[];
  initial?: SentRequestRow;
  submitLabel: string;
  onSubmit: (input: RequestInput) => Promise<SubmitResult>;
  onCancel?: () => void;
}) {
  const [assigneeUserId, setAssigneeUserId] = useState(initial?.assigneeUserId ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = filter.trim();
  const shown = assignees.filter((a) =>
    q === "" ? true : `${a.name}${a.nameKana}${a.employeeNumber}${a.affiliation}`.includes(q),
  );
  const selected = assignees.find((a) => a.id === assigneeUserId);
  const selectedName = selected?.name ?? initial?.assigneeName ?? null;
  const idPrefix = initial ? `req-${initial.id}` : "req-new";

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    if (!assigneeUserId) return setError("頼む相手を選んでください。");
    if (!text.trim()) return setError("やってほしいことを入力してください。");
    setPending(true);
    setError(null);
    try {
      const result = await onSubmit({ assigneeUserId, text: text.trim(), description, dueDate });
      if (result.error) setError(result.error);
    } catch {
      setError("保存できませんでした。もう一度お試しください。");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <p className={LABEL_CLASS}>
          頼む相手<span className="bg-brand03 ml-2 px-1 text-xs font-normal text-white">必須</span>
          <span className="text-brand04 ml-2 font-normal">
            {selectedName ? `${selectedName}さん` : "まだ選んでいません"}
          </span>
        </p>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="氏名・フリガナ・社員番号・所属で絞り込み"
          aria-label="頼む相手を絞り込み"
          className={`${FIELD_CLASS} mb-2 bg-white`}
        />
        <ul
          className="border-brand01/20 max-h-56 overflow-y-auto border bg-white"
          role="radiogroup"
          aria-label="頼む相手"
        >
          {shown.map((a) => (
            <li key={a.id} className="border-brand04/30 border-b last:border-b-0">
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="radio"
                  name={`${idPrefix}-assignee`}
                  checked={assigneeUserId === a.id}
                  onChange={() => setAssigneeUserId(a.id)}
                  className="accent-brand01 size-4"
                />
                <span className="text-brand01 font-bold">{a.name}</span>
                <span className="text-brand04 ml-auto text-xs">{a.affiliation}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 ? (
            <li className="text-brand04 px-3 py-4 text-center text-sm">該当する社員がいません。</li>
          ) : null}
        </ul>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-text`} className={LABEL_CLASS}>
          やってほしいこと<span className="bg-brand03 ml-2 px-1 text-xs font-normal text-white">必須</span>
        </label>
        <input
          id={`${idPrefix}-text`}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder="例: 見積もりを出す"
          className={`${FIELD_CLASS} bg-white`}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <div>
          <label htmlFor={`${idPrefix}-due`} className={LABEL_CLASS}>
            期限<span className="text-brand04 ml-2 text-xs font-normal">(任意)</span>
          </label>
          <input
            id={`${idPrefix}-due`}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={`${FIELD_CLASS} bg-white`}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-desc`} className={LABEL_CLASS}>
            メモ<span className="text-brand04 ml-2 text-xs font-normal">(任意)</span>
          </label>
          <textarea
            id={`${idPrefix}-desc`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            rows={2}
            className={`${FIELD_CLASS} resize-y bg-white leading-relaxed`}
          />
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-brand03 text-sm font-bold">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {onCancel ? (
          <button type="button" onClick={onCancel} className={BUTTON_SECONDARY}>
            キャンセル
          </button>
        ) : null}
        <button type="submit" disabled={pending} className={`${BUTTON_PRIMARY} sm:w-40`}>
          {pending ? "送信中…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
