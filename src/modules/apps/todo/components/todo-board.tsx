"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, LABEL_CLASS, StatusTag } from "@/modules/core/shared/ui/form";
import {
  acknowledgeRequestAction,
  createTodoAction,
  deleteTodoAction,
  restoreTodoAction,
  returnRequestAction,
  updateTodoAction,
} from "../actions";
import type { AssigneeOption, CategoryRow, SentRequestRow, TodoRow } from "../queries";
import { RETURN_REASON_MAX, personLabel } from "../requests";
import type { TodoPriority } from "../schema";
import { Attachments } from "./attachments";
import { DUE_TONE_CLASS, describeDueDate } from "./format";
import { RequestPanel } from "./request-panel";

// TODO の画面(TODOSample の機能を、ポータルのデザインで作り直したもの。docs/DESIGN.md 25 章)。

const PRIORITY_LABEL: Record<TodoPriority, string> = { low: "低", medium: "中", high: "高" };
const PRIORITY_ORDER: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 };
const FALLBACK_CATEGORY: CategoryRow = { code: "other", label: "その他", icon: "📌" };

type SortKey = "added" | "due" | "priority";
const SORT_LABEL: Record<SortKey, string> = { added: "追加順", due: "期限順", priority: "優先度" };

type Tab = "mine" | "sent";

type ToastTone = "success" | "error";
type Toast = { id: number; message: string; tone: ToastTone; undo?: () => void | Promise<void> };
function Heading({ en, ja }: { en: string; ja: string }) {
  return (
    <h2 className="flex items-baseline gap-3">
      <span className="font-heading text-brand01 text-2xl font-black tracking-wider">{en}</span>
      <span className="text-brand04 text-sm tracking-[0.2em]">{ja}</span>
    </h2>
  );
}

export function TodoBoard({
  initialTodos,
  categories,
  today,
  initialSent,
  assignees,
}: {
  initialTodos: TodoRow[];
  categories: CategoryRow[];
  today: string;
  /** 本人が頼んだ依頼(docs/DESIGN.md 41 章) */
  initialSent: SentRequestRow[];
  /** 依頼の相手の候補 */
  assignees: AssigneeOption[];
}) {
  const [tab, setTab] = useState<Tab>("mine");
  const [sent, setSent] = useState<SentRequestRow[]>(initialSent);
  const sentOpen = sent.filter((r) => r.state !== "done").length;
  const [todos, setTodos] = useState<TodoRow[]>(initialTodos);
  const [returning, setReturning] = useState<TodoRow | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnPending, setReturnPending] = useState(false);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<TodoRow, "id" | "done" | "request">>({
    text: "",
    description: "",
    priority: "medium",
    category: "other",
    dueDate: "",
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("added");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const categoryByCode = useMemo(() => new Map(categories.map((c) => [c.code, c])), [categories]);
  const categoryOf = (code: string) => categoryByCode.get(code) ?? FALLBACK_CATEGORY;

  const nextToastId = useRef(0);
  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));
  const showToast = (message: string, tone: ToastTone = "success", undo?: () => void) => {
    const id = ++nextToastId.current;
    setToasts((prev) => [...prev, { id, message, tone, undo }]);
    // 失敗の知らせと、取り消しができる知らせは、少し長く出す。
    setTimeout(() => dismissToast(id), undo || tone === "error" ? 5000 : 2500);
  };

  const addTodo = async () => {
    const text = input.trim();
    if (!text || adding) return;
    setAdding(true);
    setInput("");
    try {
      const created = await createTodoAction(text);
      setTodos((prev) => [...prev, created]);
      showToast(`追加しました(${categoryOf(created.category).label})`);
    } catch {
      setInput(text);
      showToast("追加に失敗しました", "error");
    } finally {
      setAdding(false);
    }
  };

  const toggleTodo = async (id: string) => {
    const target = todos.find((t) => t.id === id);
    if (!target) return;
    const done = !target.done;
    // 頼まれた依頼は、何か操作すると「確認しました」も付く(サーバー側と同じ)
    const ack = (t: TodoRow): TodoRow => (t.request ? { ...t, request: { ...t.request, acknowledged: true } } : t);
    setTodos((prev) => prev.map((t) => (t.id === id ? ack({ ...t, done }) : t)));
    showToast(done ? "完了しました" : "未完了に戻しました");
    try {
      await updateTodoAction(id, { done });
    } catch {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !done } : t)));
      showToast("更新に失敗しました", "error");
    }
  };

  const deleteTodo = async (id: string) => {
    const index = todos.findIndex((t) => t.id === id);
    if (index === -1) return;
    const removed = todos[index];
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteTodoAction(id);
    } catch {
      setTodos((prev) => {
        const next = [...prev];
        next.splice(index, 0, removed);
        return next;
      });
      showToast("削除に失敗しました", "error");
      return;
    }
    showToast("削除しました", "success", async () => {
      try {
        const { text, done, description, priority, category, dueDate } = removed;
        const restored = await restoreTodoAction({ text, done, description, priority, category, dueDate });
        setTodos((prev) => {
          const next = [...prev];
          next.splice(index, 0, restored);
          return next;
        });
      } catch {
        showToast("元に戻せませんでした", "error");
      }
    });
  };

  const openDetails = (t: TodoRow) => {
    setEditingId(t.id);
    setDraft({
      text: t.text,
      description: t.description,
      priority: t.priority,
      category: t.category,
      dueDate: t.dueDate,
    });
  };
  const closeDetails = () => setEditingId(null);

  const saveDetails = async () => {
    if (editingId === null) return;
    const text = draft.text.trim();
    if (!text) return;
    const before = todos.find((t) => t.id === editingId);
    // 頼まれた依頼は、カテゴリと優先度だけを変えられる(タスク名・詳細・期限は頼んだ人のもの)
    const fields = before?.request ? { priority: draft.priority, category: draft.category } : { ...draft, text };
    const apply = (t: TodoRow): TodoRow =>
      t.request ? { ...t, ...fields, request: { ...t.request, acknowledged: true } } : { ...t, ...fields };
    setTodos((prev) => prev.map((t) => (t.id === editingId ? apply(t) : t)));
    const id = editingId;
    closeDetails();
    showToast("保存しました");
    try {
      await updateTodoAction(id, fields);
    } catch {
      if (before) setTodos((prev) => prev.map((t) => (t.id === id ? before : t)));
      showToast("保存に失敗しました", "error");
    }
  };

  const acknowledge = async (id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id && t.request ? { ...t, request: { ...t.request, acknowledged: true } } : t)),
    );
    try {
      const result = await acknowledgeRequestAction(id);
      if (!result.ok) showToast(result.error, "error");
    } catch {
      showToast("更新に失敗しました", "error");
    }
  };

  const openReturn = (t: TodoRow) => {
    setReturning(t);
    setReturnReason("");
  };

  const submitReturn = async () => {
    if (!returning || returnPending) return;
    setReturnPending(true);
    try {
      const result = await returnRequestAction(returning.id, returnReason);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      const id = returning.id;
      setTodos((prev) => prev.filter((t) => t.id !== id));
      showToast(`${personLabel(returning.request?.fromName)}にお返ししました`);
      setReturning(null);
    } catch {
      showToast("お返しできませんでした", "error");
    } finally {
      setReturnPending(false);
    }
  };

  useEffect(() => {
    if (editingId === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditingId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingId]);

  const sortTodos = (list: TodoRow[]) => {
    if (sortKey === "added") return list;
    return [...list].sort((a, b) => {
      if (sortKey === "priority") return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (!a.dueDate) return b.dueDate ? 1 : 0;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  };

  const visible = filterCategory ? todos.filter((t) => t.category === filterCategory) : todos;
  const active = sortTodos(visible.filter((t) => !t.done));
  const done = visible.filter((t) => t.done);
  const usedCategories = categories.filter((c) => todos.some((t) => t.category === c.code));
  const editing = todos.find((t) => t.id === editingId) ?? null;

  const chip = (selected: boolean) =>
    `px-3 py-1.5 text-sm transition-colors ${selected ? "bg-brand01 text-white" : "bg-bg01 text-brand04 hover:text-brand03"}`;

  const renderItem = (t: TodoRow) => {
    const due = t.dueDate ? describeDueDate(t.dueDate, today) : null;
    const cat = categoryOf(t.category);
    return (
      <li key={t.id} className="border-brand04/40 border-b first:border-t">
        <div className="flex items-start gap-3 py-3">
          <input
            type="checkbox"
            checked={t.done}
            onChange={() => toggleTodo(t.id)}
            aria-label={`${t.text} を${t.done ? "未完了に戻す" : "完了にする"}`}
            className="accent-brand01 mt-1 size-4 shrink-0 cursor-pointer"
          />
          <span className="mt-0.5 shrink-0" title={cat.label} aria-label={cat.label}>
            {cat.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => openDetails(t)}
                className={`hover:text-brand03 text-left font-bold transition-colors ${
                  t.done ? "text-brand04 line-through" : "text-brand01"
                }`}
              >
                {t.text}
              </button>
              <StatusTag tone={t.priority === "high" ? "attention" : t.priority === "medium" ? "info" : "neutral"}>
                {PRIORITY_LABEL[t.priority]}
              </StatusTag>
              {due ? (
                <span className={`text-sm ${t.done ? "text-brand04" : DUE_TONE_CLASS[due.tone]}`} title={t.dueDate}>
                  {due.label}
                </span>
              ) : null}
              {t.request ? (
                <span className="border-brand01 text-brand01 border px-1 text-xs leading-5 font-bold whitespace-nowrap">
                  {personLabel(t.request.fromName)}から
                </span>
              ) : null}
              {t.request && !t.request.acknowledged && !t.done ? (
                <span className="bg-brand03 px-1 text-xs leading-5 font-bold whitespace-nowrap text-white">
                  新しい依頼
                </span>
              ) : null}
            </div>
            {t.description ? (
              <p className="text-brand04 mt-1 text-sm leading-relaxed whitespace-pre-wrap">{t.description}</p>
            ) : null}
            {t.request && !t.done ? (
              <div className="mt-1.5 flex gap-4 text-sm">
                {!t.request.acknowledged ? (
                  <button
                    type="button"
                    onClick={() => void acknowledge(t.id)}
                    className="text-brand01 hover:text-brand03 font-bold transition-colors"
                  >
                    確認しました
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => openReturn(t)}
                  className="text-brand04 hover:text-brand03 font-bold transition-colors"
                >
                  お返しする
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => openDetails(t)}
            aria-label="編集"
            title="編集"
            className="text-brand01 hover:text-brand03 shrink-0 p-1.5 transition-colors"
          >
            ✎
          </button>
          {t.request ? (
            // 依頼は削除しない(やらない場合は「お返しする」)
            <span className="w-7 shrink-0" aria-hidden />
          ) : (
            <button
              type="button"
              onClick={() => deleteTodo(t.id)}
              aria-label="削除"
              title="削除"
              className="text-brand01 hover:text-brand03 shrink-0 p-1.5 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <div>
        <h1 className="flex items-baseline gap-3">
          <span className="font-heading text-brand01 text-3xl font-black tracking-wider">TODO</span>
          <span className="text-brand04 text-sm tracking-[0.2em]">タスク管理</span>
        </h1>
        <p className="text-brand04 mt-1 text-sm">
          自分のタスクは、あなたにしか見えません。追加すると、自動でカテゴリに分けます。ほかの人に頼んだこと・頼まれたことは、頼んだ人と頼まれた人の
          2 人だけが見られます。
        </p>
      </div>

      <div className="border-brand01/20 flex gap-1 border-b" role="tablist" aria-label="表示の切り替え">
        {(
          [
            ["mine", "自分のタスク"],
            ["sent", `頼んだこと${sentOpen > 0 ? `(${sentOpen})` : ""}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-4 px-4 py-2 text-sm font-bold transition-colors ${
              tab === key ? "border-brand01 text-brand01" : "text-brand04 hover:text-brand03 border-transparent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "sent" ? (
        <RequestPanel sent={sent} setSent={setSent} assignees={assignees} today={today} onMessage={showToast} />
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addTodo();
            }}
            className="bg-bg01 flex flex-col gap-3 p-4 sm:flex-row"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={200}
              placeholder="タスクを追加"
              aria-label="タスクを追加"
              className={`${FIELD_CLASS} bg-white sm:flex-1`}
            />
            <button type="submit" disabled={adding || !input.trim()} className={`${BUTTON_PRIMARY} sm:w-40`}>
              {adding ? "追加中…" : "追加する"}
            </button>
          </form>

          <section aria-labelledby="todo-tasks" className="flex flex-col gap-4">
            <div id="todo-tasks">
              <Heading en="TASKS" ja="タスク一覧" />
            </div>
            {todos.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilterCategory(null)}
                    className={chip(filterCategory === null)}
                  >
                    すべて
                  </button>
                  {usedCategories.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setFilterCategory(filterCategory === c.code ? null : c.code)}
                      className={chip(filterCategory === c.code)}
                      title={c.label}
                    >
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                    <button key={k} type="button" onClick={() => setSortKey(k)} className={chip(sortKey === k)}>
                      {SORT_LABEL[k]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {active.length === 0 ? (
              <p className="bg-bg01 text-brand04 px-6 py-12 text-center text-sm">
                {filterCategory ? `「${categoryOf(filterCategory).label}」のタスクはありません` : "タスクはありません"}
              </p>
            ) : (
              <ul>{active.map(renderItem)}</ul>
            )}
          </section>

          {done.length > 0 ? (
            <section aria-label="完了したタスク" className="bg-bg01 p-4">
              <button
                type="button"
                onClick={() => setShowArchive((v) => !v)}
                aria-expanded={showArchive}
                className="group flex w-full items-center justify-between text-left"
              >
                <Heading en="ARCHIVE" ja={`完了したタスク(${done.length})`} />
                <span className="text-brand01 group-hover:text-brand03 text-xl transition-colors">
                  {showArchive ? "⌃" : "⌄"}
                </span>
              </button>
              {showArchive ? <ul className="mt-4 bg-white px-3">{done.map(renderItem)}</ul> : null}
            </section>
          ) : null}
        </>
      )}

      {editing ? (
        <div
          className="bg-brand01/50 fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
          onClick={closeDetails}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="todo-edit-title"
            className="border-brand01 max-h-full w-full max-w-xl overflow-y-auto border-t-8 bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="todo-edit-title" className="flex items-baseline gap-3">
              <span className="font-heading text-brand01 text-2xl font-black tracking-wider">EDIT</span>
              <span className="text-brand04 text-sm tracking-[0.2em]">タスクを編集</span>
            </h2>
            {editing.request ? (
              <div className="bg-bg01 mt-6 flex flex-col gap-1 p-4 text-sm">
                <p className="text-brand04">
                  {personLabel(editing.request.fromName)}
                  からの依頼です。内容と期限は、頼んだ人だけが変えられます。カテゴリと優先度は、自分用に変えられます。
                </p>
                <p className="text-brand01 mt-2 font-bold [overflow-wrap:anywhere]">{editing.text}</p>
                {editing.dueDate ? <p className="text-brand01">期限 {editing.dueDate.replaceAll("-", ".")}</p> : null}
                {editing.description ? (
                  <p className="text-brand01 whitespace-pre-wrap [overflow-wrap:anywhere]">{editing.description}</p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-6 flex flex-col gap-5">
              {!editing.request ? (
                <div>
                  <label htmlFor="todo-edit-text" className={LABEL_CLASS}>
                    タスク名<span className="bg-brand03 ml-2 px-1 text-xs font-normal text-white">必須</span>
                  </label>
                  <input
                    id="todo-edit-text"
                    type="text"
                    value={draft.text}
                    onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                    maxLength={200}
                    autoFocus
                    className={FIELD_CLASS}
                  />
                </div>
              ) : null}
              <div>
                <p className={LABEL_CLASS}>カテゴリー</p>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, category: c.code }))}
                      aria-pressed={draft.category === c.code}
                      className={chip(draft.category === c.code)}
                    >
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className={LABEL_CLASS}>優先度</p>
                <div className="flex gap-1.5">
                  {(Object.keys(PRIORITY_LABEL) as TodoPriority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, priority: p }))}
                      aria-pressed={draft.priority === p}
                      className={`${chip(draft.priority === p)} px-5`}
                    >
                      {PRIORITY_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
              {!editing.request ? (
                <>
                  <div>
                    <label htmlFor="todo-edit-due" className={LABEL_CLASS}>
                      期限
                    </label>
                    <input
                      id="todo-edit-due"
                      type="date"
                      value={draft.dueDate}
                      onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label htmlFor="todo-edit-desc" className={LABEL_CLASS}>
                      詳細
                    </label>
                    <textarea
                      id="todo-edit-desc"
                      value={draft.description}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      maxLength={5000}
                      rows={4}
                      placeholder="詳細を入力"
                      className={`${FIELD_CLASS} resize-none leading-relaxed`}
                    />
                  </div>
                  <Attachments todoId={editing.id} onMessage={showToast} />
                </>
              ) : null}
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeDetails} className={BUTTON_SECONDARY}>
                キャンセル
              </button>
              <button type="button" onClick={saveDetails} disabled={!draft.text.trim()} className={BUTTON_PRIMARY}>
                保存する
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {returning ? (
        <div
          className="bg-brand01/50 fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
          onClick={() => setReturning(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="todo-return-title"
            className="border-brand01 max-h-full w-full max-w-xl overflow-y-auto border-t-8 bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="todo-return-title" className="flex items-baseline gap-3">
              <span className="font-heading text-brand01 text-2xl font-black tracking-wider">RETURN</span>
              <span className="text-brand04 text-sm tracking-[0.2em]">依頼をお返しする</span>
            </h2>
            <p className="text-brand01 mt-4 text-sm">
              「<span className="font-bold [overflow-wrap:anywhere]">{returning.text}</span>」を
              {personLabel(returning.request?.fromName)}にお返しします。あなたの TODO
              からは消え、頼んだ人の画面に「お返し」と出ます。
            </p>
            <div className="mt-4">
              <label htmlFor="todo-return-reason" className={LABEL_CLASS}>
                ひとこと
                <span className="text-brand04 ml-2 text-xs font-normal">(任意・{RETURN_REASON_MAX}文字まで)</span>
              </label>
              <textarea
                id="todo-return-reason"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                maxLength={RETURN_REASON_MAX}
                rows={2}
                autoFocus
                placeholder="例: 今週は手が回らないので、○○さんにお願いできますか"
                className={`${FIELD_CLASS} resize-none leading-relaxed`}
              />
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setReturning(null)} className={BUTTON_SECONDARY}>
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void submitReturn()}
                disabled={returnPending}
                className={BUTTON_PRIMARY}
              >
                {returnPending ? "送信中…" : "お返しする"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed top-20 right-4 z-50 flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`text-brand01 flex items-center gap-4 border px-4 py-3 text-sm ${
              t.tone === "error" ? "border-brand03 bg-brand03/10" : "border-brand01 bg-white"
            }`}
          >
            <span>
              <span aria-hidden="true" className={t.tone === "error" ? "text-brand03 font-bold" : ""}>
                {t.tone === "error" ? "!" : "✓"}
              </span>{" "}
              {t.message}
            </span>
            {t.undo ? (
              <button
                type="button"
                onClick={() => {
                  void t.undo?.();
                  dismissToast(t.id);
                }}
                className="bg-bg01 hover:text-brand03 px-3 py-1 transition-colors"
              >
                取り消す
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
