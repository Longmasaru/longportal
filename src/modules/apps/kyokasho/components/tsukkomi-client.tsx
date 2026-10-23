"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { DictationButton } from "@/modules/core/shared/ui/dictation";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, FormNotice } from "@/modules/core/shared/ui/form";
import {
  BODY_MAX,
  COMMENT_KINDS,
  COMMENT_STATUSES,
  KIND_LABELS,
  POLISH_MIN,
  QUOTE_MAX,
  REPLY_MAX,
  STATUS_LABELS,
  type CommentKind,
} from "../tsukkomi";
import {
  deleteCommentAction,
  handleCommentAction,
  polishTsukkomiAction,
  postCommentAction,
  type TsukkomiFormState,
} from "../tsukkomi-actions";
import { BURST_FONT, BURST_TEXT, TsukkomiBurst } from "./tsukkomi-burst";

// ツッコミの入力まわり(docs/DESIGN.md 32 章)。見出しの横の「ツッコむ」・右下の「ツッコむ」・文を選んで「選んだ文にツッコむ」から、
// 画面の横(スマホは下)に書く欄を出す(Google スプレッドシートのコメントのように)。ページは動かさず、ツッコむところに印を付けたまま書ける。

const EVENT = "kyokasho:tsukkomi";
/** 章の本文を囲む要素の id(選んだ文と、読んでいる節を探す範囲)。 */
export const BODY_ID = "kyokasho-body";
/** 書く欄の幅(PC)。本文がこの下に隠れないよう、開いている間は本文の右に余白を足す。 */
const PANEL_WIDTH = 400;
const MD_QUERY = "(min-width: 768px)";
const HIGHLIGHT = "tsukkomi";

type Pick = { sectionId: string; quote?: string; range?: Range | null };

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
function selectedInBody(): { text: string; node: Node; range: Range } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const body = document.getElementById(BODY_ID);
  const node = sel.anchorNode;
  if (!body || !node || !body.contains(node)) return null;
  const text = sel.toString().replace(/\s+/g, " ").trim();
  if (text.length < 2) return null;
  return {
    text: text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX - 1)}…` : text,
    node,
    range: sel.getRangeAt(0).cloneRange(),
  };
}

/** ツッコむところ(選んだ文、なければ節の見出し)の画面上の上端。 */
function anchorTop(pick: Pick | null): number | null {
  if (!pick) return null;
  if (pick.range) return pick.range.getBoundingClientRect().top;
  const h = pick.sectionId ? document.getElementById(pick.sectionId) : null;
  return h ? h.getBoundingClientRect().top : null;
}

/** 選んだ文と見出しに印を付ける(書いている間、どこへのツッコミかが見えるように)。 */
function mark(pick: Pick | null) {
  const highlights = (globalThis.CSS as { highlights?: Map<string, unknown> } | undefined)?.highlights;
  const HighlightCtor = (globalThis as { Highlight?: new (r: Range) => unknown }).Highlight;
  highlights?.delete(HIGHLIGHT);
  document.querySelectorAll("[data-tsukkomi-target]").forEach((el) => el.removeAttribute("data-tsukkomi-target"));
  if (!pick) return;
  if (pick.range && highlights && HighlightCtor) highlights.set(HIGHLIGHT, new HighlightCtor(pick.range));
  const h = pick.sectionId ? document.getElementById(pick.sectionId) : null;
  h?.setAttribute("data-tsukkomi-target", "");
}

/** PC で書く欄が本文に重なる分だけ、本文の右に余白を足す(足したぶん本文が動くので、ツッコむところの位置は戻す)。 */
function makeRoom(open: boolean, pick: Pick | null) {
  const shell = document.getElementById(BODY_ID)?.parentElement;
  if (!shell) return;
  const before = anchorTop(pick);
  shell.style.paddingRight = "";
  if (open && window.matchMedia(MD_QUERY).matches) {
    const overlap = shell.getBoundingClientRect().right - (window.innerWidth - PANEL_WIDTH - 24);
    if (overlap > 0) shell.style.paddingRight = `${parseFloat(getComputedStyle(shell).paddingRight) + overlap}px`;
  }
  const after = anchorTop(pick);
  if (before !== null && after !== null && Math.abs(after - before) > 1) window.scrollBy(0, after - before);
}

export function BubbleIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" strokeLinejoin="round" />
    </svg>
  );
}

/** 見出しの横の小さなボタン。押すと、その節を選んだ状態で書く欄が開く。 */
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

/** 章の終わりの「この章にツッコむ」。 */
export function ChapterTsukkomiButton() {
  return (
    <div>
      <button type="button" onClick={() => openForm({ sectionId: "" })} className={`${BUTTON_PRIMARY} inline-flex items-center gap-2`}>
        <BubbleIcon className="size-4" />
        この章にツッコむ
      </button>
    </div>
  );
}

const PLACEHOLDERS: Record<CommentKind, string> = {
  question: "例: 「○○を確認する」とありますが、何を見ればよいですか?",
  addition: "例: 写真があるとわかりやすいです。今は△△のやり方もしています。",
  mistake: "例: 治具の番号が今と違います(今は B-12)。",
  comment: "例: この章のおかげで、段取りが早くなりました。",
};

/**
 * ツッコミの書く欄(PC は画面の右、スマホは画面の下に出る)と、右下の「ツッコむ」。
 * 開いてもページは動かさない(PC は本文の右に余白を足し、ツッコむところの位置を保つ。スマホは、ツッコむところが
 * 書く欄の下に隠れるときだけ、上に見えるところまで送る)。選んだ文と見出しには印を付け、その節のツッコミも並べる。
 * threads は、節の id(章全体は "")ごとのツッコミの一覧(サーバーで描いたもの)。
 */
export function TsukkomiPanel({
  bookId,
  chapterNo,
  sections,
  threads,
  counts,
}: {
  bookId: string;
  chapterNo: number;
  sections: { id: string; level: number; text: string }[];
  threads: Record<string, ReactNode>;
  counts: Record<string, number>;
}) {
  const [state, action, pending] = useActionState<TsukkomiFormState, FormData>(postCommentAction, undefined);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [kind, setKind] = useState<CommentKind>("question");
  const [sectionId, setSectionId] = useState("");
  const [body, setBody] = useState("");
  const [quote, setQuote] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const [polishError, setPolishError] = useState<string | null>(null);
  const [polishing, startPolish] = useTransition();
  const [selected, setSelected] = useState<{ text: string; sectionId: string; range: Range } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const clearTimer = useRef<number | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    mark(null);
    makeRoom(false, pick);
  }, [pick]);

  // 開く(見出し・右下・章の終わりのボタンから)。
  useEffect(() => {
    const onPick = (e: Event) => {
      const p = (e as CustomEvent<Pick>).detail;
      const id = sections.some((s) => s.id === p.sectionId) ? p.sectionId : "";
      const next = { ...p, sectionId: id };
      setPick(next);
      setSectionId(id);
      setQuote(p.quote ?? "");
      setOpen(true);
      mark(next);
      // 送ったときの演出の書体を、先に読み込んでおく。
      document.fonts?.load(`1em ${BURST_FONT}`, BURST_TEXT).catch(() => {});
      // 書く欄が描かれてから、場所を空ける・見えるところへ送る。
      requestAnimationFrame(() => {
        makeRoom(true, next);
        if (window.matchMedia(MD_QUERY).matches) {
          area.current?.focus({ preventScroll: true });
        } else {
          const top = anchorTop(next);
          const sheet = panel.current?.getBoundingClientRect().top ?? window.innerHeight;
          if (top !== null && (top < 64 || top > sheet - 48)) window.scrollBy({ top: top - 72, behavior: "smooth" });
        }
      });
    };
    window.addEventListener(EVENT, onPick);
    return () => window.removeEventListener(EVENT, onPick);
  }, [sections]);

  // 本文の文を選ぶと、右下が「選んだ文にツッコむ」に変わる。
  useEffect(() => {
    const onChange = () => {
      const s = selectedInBody();
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
      if (s) setSelected({ text: s.text, sectionId: sectionBefore(s.node), range: s.range });
      // ボタンを押した瞬間に選択が外れても使えるよう、消すのは少し待つ
      else clearTimer.current = window.setTimeout(() => setSelected(null), 400);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // ページを離れるときは、印と余白を消す。
  useEffect(() => () => mark(null), []);

  // 送れたら中身を空にする(送った時刻が変わるたび。描画の中で一度だけ行う)。
  const [seenAt, setSeenAt] = useState<number | undefined>(undefined);
  const [burst, setBurst] = useState(false);
  const endBurst = useCallback(() => setBurst(false), []);
  if (state?.success && state.at !== seenAt) {
    setSeenAt(state.at);
    setBurst(true);
    setBody("");
    setPrevious(null);
    setSuggestion(null);
  }

  function polish() {
    setPolishError(null);
    setSuggestion(null);
    startPolish(async () => {
      const result = await polishTsukkomiAction({ bookId, chapterNo, sectionId, quote, kind, body });
      if ("error" in result) setPolishError(result.error);
      else setSuggestion(result.text);
    });
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };

  const sectionTitle = sections.find((s) => s.id === sectionId)?.text ?? "この章全体";
  const threadCount = counts[sectionId] ?? 0;

  return (
    <>
      <style>{`::highlight(${HIGHLIGHT}){background-color:rgb(255 213 79 / 0.6)}[data-tsukkomi-target]{background-color:rgb(255 213 79 / 0.35);box-shadow:-0.5rem 0 0 rgb(255 213 79 / 0.35),0.5rem 0 0 rgb(255 213 79 / 0.35)}`}</style>
      {burst ? <TsukkomiBurst key={seenAt} onDone={endBurst} /> : null}

      {open ? null : (
        <button
          type="button"
          onClick={() => {
            if (selected) {
              openForm({ sectionId: selected.sectionId, quote: selected.text, range: selected.range });
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
      )}

      {open ? (
        <div
          ref={panel}
          role="dialog"
          aria-modal="false"
          aria-labelledby="tsukkomi-panel-title"
          className="border-brand01 fixed inset-x-0 bottom-0 z-40 flex max-h-[62dvh] flex-col border-t-4 bg-white shadow-[0_-6px_24px_rgba(0,0,0,0.18)] md:top-14 md:right-0 md:left-auto md:max-h-none md:w-[400px] md:border-t-0 md:border-l md:border-l-brand01/20 md:shadow-[-6px_0_24px_rgba(0,0,0,0.12)]"
        >
          <div className="border-brand01/15 flex items-start gap-3 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <p id="tsukkomi-panel-title" className="text-brand01 flex items-center gap-1.5 text-sm font-bold">
                <BubbleIcon className="size-4" />
                ツッコむ
              </p>
              <p className="text-brand04 mt-0.5 truncate text-xs">{sectionTitle}</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="閉じる"
              className="text-brand04 hover:text-brand03 -mr-1 shrink-0 px-2 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <form onSubmit={submit} className="flex flex-col gap-4">
              <input type="hidden" name="bookId" value={bookId} />
              <input type="hidden" name="chapterNo" value={chapterNo} />
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="quote" value={quote} />

              {quote ? (
                <div className="border-brand01/25 bg-bg01 flex items-start gap-3 border-l-4 px-3 py-2">
                  <p className="font-prose text-ink min-w-0 flex-1 text-sm leading-relaxed">
                    <span className="text-brand01 mr-1 text-xs font-bold">引用</span>「{quote}」
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuote("");
                      const next = pick ? { ...pick, range: null } : null;
                      setPick(next);
                      mark(next);
                    }}
                    className="text-brand04 hover:text-brand03 shrink-0 text-xs underline underline-offset-2"
                  >
                    外す
                  </button>
                </div>
              ) : null}

              <fieldset>
                <legend className="sr-only">どんなツッコミ?</legend>
                <div className="grid grid-cols-4 gap-1.5">
                  {COMMENT_KINDS.map((k) => {
                    const on = kind === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        title={KIND_LABELS[k].hint}
                        onClick={() => setKind(k)}
                        className={`border px-1 py-1.5 text-xs font-bold transition-colors ${
                          on ? "border-brand01 bg-brand01 text-white" : "border-brand01/20 text-brand01 hover:border-brand01 bg-white"
                        }`}
                      >
                        {KIND_LABELS[k].label.replace("付け足し・改善", "付け足し")}
                      </button>
                    );
                  })}
                </div>
                <p className="text-brand04 mt-1 text-[11px]">{KIND_LABELS[kind].hint}</p>
              </fieldset>

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
                  placeholder={PLACEHOLDERS[kind]}
                  className={`${FIELD_CLASS} min-h-24 resize-y leading-relaxed`}
                />
                <p className="text-brand04 mt-1 flex justify-between gap-3 text-xs">
                  <span>名前つきで、この教科書を見られる人に表示されます。</span>
                  <span className="shrink-0 tabular-nums">
                    {body.length} / {BODY_MAX}
                  </span>
                </p>
              </div>

              <div className="-mt-1 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button
                    type="button"
                    onClick={polish}
                    disabled={polishing || body.trim().length < POLISH_MIN}
                    className="border-brand01/30 text-brand01 hover:border-brand03 hover:text-brand03 inline-flex items-center gap-1.5 border bg-white px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50"
                  >
                    <span aria-hidden>✨</span>
                    {polishing ? "整えています…" : "AIで整える"}
                  </button>
                  {previous !== null && suggestion === null ? (
                    <button
                      type="button"
                      onClick={() => {
                        setBody(previous);
                        setPrevious(null);
                      }}
                      className="text-brand04 hover:text-brand03 text-sm font-bold transition-colors"
                    >
                      元に戻す
                    </button>
                  ) : null}
                </div>
                {polishError ? (
                  <p role="alert" className="text-brand03 text-sm font-bold">
                    {polishError}
                  </p>
                ) : null}
                {suggestion !== null ? (
                  <div className="border-brand01/20 bg-bg01 flex flex-col gap-3 border p-3" aria-live="polite">
                    <p className="text-brand01 text-xs font-bold tracking-widest">AI の案(まだ入っていません)</p>
                    <p className="font-prose text-ink text-sm leading-relaxed whitespace-pre-wrap">{suggestion}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPrevious(body);
                          setBody(suggestion.slice(0, BODY_MAX));
                          setSuggestion(null);
                        }}
                        className={BUTTON_PRIMARY}
                      >
                        この案を使う
                      </button>
                      <button type="button" onClick={() => setSuggestion(null)} className={BUTTON_SECONDARY}>
                        使わない
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <details className="text-sm">
                <summary className="text-brand04 hover:text-brand03 cursor-pointer text-xs select-none">
                  ツッコむところを変える
                </summary>
                <select
                  aria-label="どこへのツッコミ?"
                  name="sectionId"
                  value={sectionId}
                  onChange={(e) => {
                    const next = { sectionId: e.target.value, range: null };
                    setSectionId(e.target.value);
                    setQuote("");
                    setPick(next);
                    mark(next);
                  }}
                  className={`${FIELD_CLASS} mt-2`}
                >
                  <option value="">この章全体</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.level === 3 ? "　" : ""}
                      {s.text}
                    </option>
                  ))}
                </select>
              </details>

              {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
              {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}

              <div>
                <button
                  type="submit"
                  disabled={pending || body.trim() === ""}
                  className={`${BUTTON_PRIMARY} inline-flex w-full items-center justify-center gap-2`}
                >
                  <BubbleIcon className="size-4" />
                  {pending ? "送っています…" : "ツッコむ"}
                </button>
              </div>
            </form>

            {threadCount > 0 ? (
              <section className="border-brand01/15 mt-6 flex flex-col gap-3 border-t pt-4">
                <h2 className="text-brand01 text-sm font-bold">
                  {sectionId ? "この節" : "この章全体"}へのツッコミ <span className="text-brand04 font-medium">{threadCount} 件</span>
                </h2>
                {threads[sectionId]}
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
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
