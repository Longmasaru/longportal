"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { DictationButton } from "@/modules/core/shared/ui/dictation";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, FormNotice } from "@/modules/core/shared/ui/form";
import {
  BODY_MAX,
  COMMENT_KINDS,
  COMMENT_STATUSES,
  KIND_LABELS,
  QUOTE_MAX,
  REPLY_MAX,
  STATUS_LABELS,
  type CommentKind,
} from "../tsukkomi";
import {
  deleteCommentAction,
  handleCommentAction,
  postCommentAction,
  type TsukkomiFormState,
} from "../tsukkomi-actions";

// ツッコミの入力まわり(docs/DESIGN.md 32 章)。見出しの横の「ツッコむ」から、その節を選んだ状態でフォームへ移る。

const EVENT = "kyokasho:tsukkomi";
export const FORM_ID = "tsukkomi";
/** 章の本文を囲む要素の id(選んだ文と、読んでいる節を探す範囲)。 */
export const BODY_ID = "kyokasho-body";

type Pick = { sectionId: string; quote?: string };

function openForm(pick: Pick) {
  window.dispatchEvent(new CustomEvent<Pick>(EVENT, { detail: pick }));
}

/** node より前にある、いちばん近い節の見出し(見出し 2・3)の id。 */
function sectionBefore(node: Node | null): string {
  const body = document.getElementById(BODY_ID);
  if (!body || !node) return "";
  let found = "";
  for (const h of body.querySelectorAll<HTMLElement>("h2[id], h3[id]")) {
    if (h === node || h.contains(node) || h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) found = h.id;
    else break;
  }
  return found;
}

/** 画面の上の方に見えている節(読んでいるところ)の id。 */
function currentSection(): string {
  const body = document.getElementById(BODY_ID);
  if (!body) return "";
  let found = "";
  for (const h of body.querySelectorAll<HTMLElement>("h2[id], h3[id]")) {
    if (h.getBoundingClientRect().top < window.innerHeight * 0.4) found = h.id;
    else break;
  }
  return found;
}

/** 本文の中で選ばれている文(なければ null)。 */
function selectedInBody(): { text: string; node: Node } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const body = document.getElementById(BODY_ID);
  const node = sel.anchorNode;
  if (!body || !node || !body.contains(node)) return null;
  const text = sel.toString().replace(/\s+/g, " ").trim();
  if (text.length < 2) return null;
  return { text: text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX - 1)}…` : text, node };
}

/**
 * 画面の右下にいつも出る「ツッコむ」。押すと、読んでいる節を選んだ状態で書く欄へ移る。
 * 本文の文を指(マウス)でなぞって選ぶと「選んだ文にツッコむ」に変わり、その文を引用して書き始められる。
 * 書く欄が見えている間は隠す。
 */
export function FloatingTsukkomi() {
  const [selected, setSelected] = useState<{ text: string; sectionId: string } | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const clearTimer = useRef<number | null>(null);

  useEffect(() => {
    const onChange = () => {
      const s = selectedInBody();
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
      if (s) setSelected({ text: s.text, sectionId: sectionBefore(s.node) });
      // ボタンを押した瞬間に選択が外れても使えるよう、消すのは少し待つ
      else clearTimer.current = window.setTimeout(() => setSelected(null), 400);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  useEffect(() => {
    const form = document.getElementById(FORM_ID);
    if (!form) return;
    const io = new IntersectionObserver(([e]) => setFormVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(form);
    return () => io.disconnect();
  }, []);

  if (formVisible && !selected) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (selected) {
          openForm({ sectionId: selected.sectionId, quote: selected.text });
          window.getSelection()?.removeAllRanges();
          setSelected(null);
        } else openForm({ sectionId: currentSection() });
      }}
      className={`fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 inline-flex items-center gap-2 px-4 py-3 text-sm font-bold text-white shadow-[0_4px_16px_rgba(0,0,0,0.18)] transition-colors md:right-8 md:bottom-8 ${
        selected ? "bg-brand03" : "bg-brand01 hover:bg-brand03"
      }`}
    >
      <BubbleIcon className="size-5" />
      {selected ? "選んだ文にツッコむ" : "ツッコむ"}
    </button>
  );
}

/** 見出しの横の小さなボタン。押すと、その節を選んだ状態でページ下のフォームへ移る。 */
export function SectionTsukkomiButton({ sectionId, count }: { sectionId: string; count: number }) {
  return (
    <button
      type="button"
      onClick={() => openForm({ sectionId })}
      className="border-brand01/20 text-brand04 hover:border-brand03 hover:text-brand03 mt-0.5 inline-flex shrink-0 items-center gap-1 border bg-white px-2 py-1 font-sans text-xs font-bold whitespace-nowrap transition-colors"
      aria-label={count > 0 ? `この節にツッコむ(ツッコミ ${count} 件)` : "この節にツッコむ"}
    >
      <BubbleIcon />
      ツッコむ
      {count > 0 ? <span className="bg-brand03 ml-0.5 min-w-4 px-1 text-center leading-4 text-white">{count}</span> : null}
    </button>
  );
}

export function BubbleIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" strokeLinejoin="round" />
    </svg>
  );
}

/** ツッコミを書くフォーム。 */
export function TsukkomiForm({
  bookId,
  chapterNo,
  sections,
}: {
  bookId: string;
  chapterNo: number;
  sections: { id: string; level: number; text: string }[];
}) {
  const [state, action, pending] = useActionState<TsukkomiFormState, FormData>(postCommentAction, undefined);
  const [kind, setKind] = useState<CommentKind>("question");
  const [sectionId, setSectionId] = useState("");
  const [body, setBody] = useState("");
  const [quote, setQuote] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onPick = (e: Event) => {
      const { sectionId: id, quote: q } = (e as CustomEvent<Pick>).detail;
      setSectionId(sections.some((s) => s.id === id) ? id : "");
      setQuote(q ?? "");
      wrap.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      // スクロールが終わってから入力欄へ(すぐに focus すると、スマホで画面が飛ぶため)。
      window.setTimeout(() => area.current?.focus({ preventScroll: true }), 450);
    };
    window.addEventListener(EVENT, onPick);
    return () => window.removeEventListener(EVENT, onPick);
  }, [sections]);

  // 送れたら中身を空にする(送った時刻が変わるたび。描画の中で一度だけ行う)。
  const [seenAt, setSeenAt] = useState<number | undefined>(undefined);
  if (state?.success && state.at !== seenAt) {
    setSeenAt(state.at);
    setBody("");
    setQuote("");
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };

  return (
    <div ref={wrap} id={FORM_ID} className="scroll-mt-20">
      <form onSubmit={submit} className="border-brand01 flex flex-col gap-4 border-t-4 bg-white p-4 md:p-6">
        <input type="hidden" name="bookId" value={bookId} />
        <input type="hidden" name="chapterNo" value={chapterNo} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="quote" value={quote} />

        <fieldset>
          <legend className="text-brand01 mb-2 text-sm font-bold">どんなツッコミ?</legend>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {COMMENT_KINDS.map((k) => {
              const on = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setKind(k)}
                  className={`flex flex-col items-start gap-0.5 border px-3 py-2 text-left transition-colors ${
                    on ? "border-brand01 bg-brand01 text-white" : "border-brand01/20 text-brand01 hover:border-brand01 bg-white"
                  }`}
                >
                  <span className="text-sm font-bold">{KIND_LABELS[k].label}</span>
                  <span className={`text-[11px] leading-snug ${on ? "text-white/85" : "text-brand04"}`}>{KIND_LABELS[k].hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="tsukkomi-section" className="text-brand01 mb-1.5 block text-sm font-bold">
            どこへのツッコミ?
          </label>
          <select
            id="tsukkomi-section"
            name="sectionId"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">この章全体</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.level === 3 ? "　" : ""}
                {s.text}
              </option>
            ))}
          </select>
        </div>

        {quote ? (
          <div className="border-brand01/25 bg-bg01 flex items-start gap-3 border-l-4 px-3 py-2">
            <p className="font-prose text-ink min-w-0 flex-1 text-sm leading-relaxed">
              <span className="text-brand01 mr-1 text-xs font-bold">引用</span>「{quote}」
            </p>
            <button
              type="button"
              onClick={() => setQuote("")}
              className="text-brand04 hover:text-brand03 shrink-0 text-xs underline underline-offset-2"
            >
              外す
            </button>
          </div>
        ) : null}

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="tsukkomi-body" className="text-brand01 text-sm font-bold">
              ツッコミ
            </label>
            <DictationButton onText={(t) => setBody((b) => `${b}${t}`.slice(0, BODY_MAX))} />
          </div>
          <textarea
            ref={area}
            id="tsukkomi-body"
            name="body"
            rows={4}
            required
            maxLength={BODY_MAX}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              kind === "question"
                ? "例: 「○○を確認する」とありますが、何を見ればよいですか?"
                : kind === "addition"
                  ? "例: 写真があるとわかりやすいです。今は△△のやり方もしています。"
                  : kind === "mistake"
                    ? "例: 治具の番号が今と違います(今は B-12)。"
                    : "例: この章のおかげで、段取りが早くなりました。"
            }
            className={`${FIELD_CLASS} min-h-28 resize-y leading-relaxed`}
          />
          <p className="text-brand04 mt-1 flex justify-between gap-3 text-xs">
            <span>名前つきで、この教科書を見られる人に表示されます。</span>
            <span className="shrink-0 tabular-nums">
              {body.length} / {BODY_MAX}
            </span>
          </p>
        </div>

        {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
        {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}

        <div>
          <button type="submit" disabled={pending || body.trim() === ""} className={`${BUTTON_PRIMARY} inline-flex items-center gap-2`}>
            <BubbleIcon className="size-4" />
            {pending ? "送っています…" : "ツッコむ"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** 消すボタン(確かめてから)。 */
export function DeleteCommentButton({ id, label = "消す" }: { id: string; label?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <form
      action={async (formData) => {
        if (!window.confirm("このツッコミを消しますか?")) return;
        setPending(true);
        await deleteCommentAction(formData);
        setPending(false);
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-brand04 hover:text-brand03 text-xs underline underline-offset-2 disabled:opacity-50"
      >
        {pending ? "消しています…" : label}
      </button>
    </form>
  );
}

const THANK_TEMPLATE = "ツッコミありがとうございます!";

/** 教科書チームの返事と、採用の判断。 */
export function HandleCommentForm({
  id,
  status,
  reply,
  open = false,
}: {
  id: string;
  status: string;
  reply: string;
  open?: boolean;
}) {
  const [state, action, pending] = useActionState<TsukkomiFormState, FormData>(handleCommentAction, undefined);
  const [value, setValue] = useState(reply);
  const [picked, setPicked] = useState(status);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };

  return (
    <details open={open} className="group border-brand01/15 border-t pt-3">
      <summary className="text-brand01 hover:text-brand03 cursor-pointer list-none text-sm font-bold select-none">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
        教科書チーム: 返事・採用を決める
      </summary>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="id" value={id} />
        <fieldset>
          <legend className="sr-only">受け止め方</legend>
          <div className="flex flex-wrap gap-2">
            {COMMENT_STATUSES.map((s) => (
              <label
                key={s}
                className={`cursor-pointer border px-3 py-1.5 text-sm font-bold transition-colors ${
                  picked === s ? "border-brand01 bg-brand01 text-white" : "border-brand01/20 text-brand01 hover:border-brand01 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={picked === s}
                  onChange={() => setPicked(s)}
                  className="sr-only"
                />
                {STATUS_LABELS[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`reply-${id}`} className="text-brand01 text-sm font-bold">
              返事(お礼・答え・どう直すか)
            </label>
            {value.startsWith(THANK_TEMPLATE) ? null : (
              <button
                type="button"
                onClick={() => setValue(value ? `${THANK_TEMPLATE}\n${value}` : THANK_TEMPLATE)}
                className="text-link text-xs font-bold hover:underline"
              >
                「{THANK_TEMPLATE}」を入れる
              </button>
            )}
          </div>
          <textarea
            id={`reply-${id}`}
            name="reply"
            rows={3}
            maxLength={REPLY_MAX}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`${FIELD_CLASS} resize-y leading-relaxed`}
          />
        </div>
        {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
        {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}
        <div>
          <button type="submit" disabled={pending} className={BUTTON_SECONDARY}>
            {pending ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
      <div className="mt-3 flex justify-end">
        <DeleteCommentButton id={id} label="このツッコミを消す(不適切なとき)" />
      </div>
    </details>
  );
}
