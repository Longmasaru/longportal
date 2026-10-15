"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, LABEL_CLASS, StatusTag } from "@/modules/core/shared/ui/form";
import { createTodoAction, deleteTodoAction, restoreTodoAction, updateTodoAction } from "../actions";
import type { CategoryRow, TodoRow } from "../queries";
import type { TodoPriority } from "../schema";
import { Attachments } from "./attachments";

// TODO の画面(TODOSample の機能を、ポータルのデザインで作り直したもの。docs/DESIGN.md 25 章)。

const PRIORITY_LABEL: Record<TodoPriority, string> = { low: "低", medium: "中", high: "高" };
const PRIORITY_ORDER: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 };
const FALLBACK_CATEGORY: CategoryRow = { code: "other", label: "その他", icon: "📌" };

type SortKey = "added" | "due" | "priority";
const SORT_LABEL: Record<SortKey, string> = { added: "追加順", due: "期限順", priority: "優先度" };

type ToastTone = "success" | "error";
type Toast = { id: number; message: string; tone: ToastTone; undo?: () => void | Promise<void> };
type DueTone = "overdue" | "today" | "soon" | "normal";
const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: "text-brand03 font-bold",
  today: "text-brand01 font-bold",
  soon: "text-brand04",
  normal: "text-brand04",
};

/** 暦日どうしの差(日)。`YYYY-MM-DD` を UTC の日付として比べる(時差の影響を受けない)。 */
function diffDays(from: string, to: string): number {
  const ms = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** 期限を「3日超過」「今日」のような表記と、強調の度合いにする(今日は JST)。 */
function describeDueDate(dueDate: string, today: string): { label: string; tone: DueTone } {
  const d = diffDays(today, dueDate);
  if (d < 0) return { label: `${-d}日超過`, tone: "overdue" };
  if (d === 0) return { label: "今日", tone: "today" };
  if (d === 1) return { label: "明日", tone: "soon" };
  if (d <= 7) return { label: `あと${d}日`, tone: "soon" };
  return { label: dueDate.replaceAll("-", "."), tone: "normal" };
}

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
}: {
  initialTodos: TodoRow[];
  categories: CategoryRow[];
  today: string;
}) {
  const [todos, setTodos] = useState<TodoRow[]>(initialTodos);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<TodoRow, "id" | "done">>({
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
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done } : t)));
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
        const { id: _omit, ...rest } = removed;
        void _omit;
        const restored = await restoreTodoAction(rest);
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
    setDraft({ text: t.text, description: t.description, priority: t.priority, category: t.category, dueDate: t.dueDate });
  };
  const closeDetails = () => setEditingId(null);

  const saveDetails = async () => {
    if (editingId === null) return;
    const text = draft.text.trim();
    if (!text) return;
    const fields = { ...draft, text };
    const before = todos.find((t) => t.id === editingId);
    setTodos((prev) => prev.map((t) => (t.id === editingId ? { ...t, ...fields } : t)));
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
            </div>
            {t.description ? (
              <p className="text-brand04 mt-1 text-sm leading-relaxed whitespace-pre-wrap">{t.description}</p>
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
          <button
            type="button"
            onClick={() => deleteTodo(t.id)}
            aria-label="削除"
            title="削除"
            className="text-brand01 hover:text-brand03 shrink-0 p-1.5 transition-colors"
          >
            ✕
          </button>
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
          あなただけのタスクです(ほかの人には見えません)。追加すると、自動でカテゴリに分けます。
        </p>
      </div>

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
              <button type="button" onClick={() => setFilterCategory(null)} className={chip(filterCategory === null)}>
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
            <div className="mt-6 flex flex-col gap-5">
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
