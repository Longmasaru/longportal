"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DictationButton } from "@/modules/core/shared/ui/dictation";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS } from "@/modules/core/shared/ui/form";
import {
  addCommentAction,
  appraiseAction,
  deleteCommentAction,
  deleteEntryAction,
  reviewAgainAction,
  toggleReactionAction,
} from "../actions";
import {
  APPRAISAL_COMMENT_MAX,
  COMMENT_MAX,
  CRITERIA,
  CRITERION_LABEL,
  CRITERION_MAX,
  CRITERION_MIN,
  REACTION_KINDS,
  REACTION_LABEL,
  RARITY_LABEL,
  rarityOf,
  scoreOf,
  type AiReview,
  type Criterion,
  type CriterionScores,
  type ReactionKind,
} from "../constants";
import { manifest } from "../manifest";

// ページの詳細の操作(反応・コメント・鑑定・削除)。docs/DESIGN.md 44 章。

function ErrorLine({ error }: { error: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-brand03 text-sm font-bold">
      {error}
    </p>
  );
}

/** 「なるほど!」「まねしたい!」。点数には入れない(人気投票にしないため)。 */
export function Reactions({
  entryId,
  reactions,
}: {
  entryId: string;
  reactions: Record<ReactionKind, { count: number; mine: boolean }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {REACTION_KINDS.map((k) => {
          const r = reactions[k];
          return (
            <button
              key={k}
              type="button"
              disabled={pending}
              aria-pressed={r.mine}
              onClick={() =>
                startTransition(async () => {
                  const res = await toggleReactionAction(entryId, k);
                  setError(res.ok ? "" : res.error);
                  router.refresh();
                })
              }
              className={
                "inline-flex items-center gap-2 border px-4 py-2 text-sm font-bold transition-colors " +
                (r.mine ? "bg-brand01 border-brand01 text-white" : "border-brand01/25 text-brand01 hover:border-brand03 bg-white")
              }
            >
              {REACTION_LABEL[k]}
              <span className="tabular-nums">{r.count}</span>
            </button>
          );
        })}
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

export function CommentForm({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setError("コメントを入力してください。");
      return;
    }
    startTransition(async () => {
      const r = await addCommentAction(entryId, body);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError("");
      setBody("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor="zukan-comment" className="text-brand01 text-sm font-bold">
          コメントを書く
        </label>
        <DictationButton onText={(t) => setBody((prev) => (prev ? `${prev}${t}` : t).slice(0, COMMENT_MAX))} />
      </div>
      <textarea
        id="zukan-comment"
        rows={2}
        maxLength={COMMENT_MAX}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="まねしてみた、うちでも使えそう、など"
        className={`${FIELD_CLASS} resize-y`}
      />
      <ErrorLine error={error} />
      <button type="submit" disabled={pending} className={`${BUTTON_PRIMARY} self-end`}>
        {pending ? "送っています…" : "コメントする"}
      </button>
    </form>
  );
}

export function DeleteCommentButton({ commentId }: { commentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("このコメントを消しますか?")) return;
        startTransition(async () => {
          await deleteCommentAction(commentId);
          router.refresh();
        });
      }}
      className="text-brand04 hover:text-brand03 text-xs"
    >
      消す
    </button>
  );
}

/** ページの削除(削除の権限がある人だけ。不適切な内容への対応)。 */
export function DeleteEntryButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("このページを図鑑から削除しますか?写真も消え、元に戻せません。")) return;
          startTransition(async () => {
            const r = await deleteEntryAction(entryId);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            router.push(manifest.route);
          });
        }}
        className="text-brand04 hover:text-brand03 text-sm font-bold"
      >
        {pending ? "削除しています…" : "このページを削除する"}
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

/** 鑑定(点数の確定)。AI の下見を初期値にして、4 つの観点を 1〜5 で付ける。 */
export function AppraisePanel({
  entryId,
  aiReview,
  current,
  currentComment,
}: {
  entryId: string;
  aiReview: AiReview | null;
  current: CriterionScores | null;
  currentComment: string;
}) {
  const router = useRouter();
  const initial = current ?? aiReview?.scores ?? null;
  const [scores, setScores] = useState<Partial<CriterionScores>>(initial ?? {});
  const [comment, setComment] = useState(currentComment);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  const complete = CRITERIA.every((c) => typeof scores[c] === "number");
  const total = complete ? scoreOf(scores as CriterionScores) : null;
  const rarity = rarityOf(total);

  function set(c: Criterion, v: number) {
    setScores((prev) => ({ ...prev, [c]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) {
      setError("4 つの観点すべてに点を付けてください。");
      return;
    }
    startTransition(async () => {
      const r = await appraiseAction(entryId, { scores: scores as CriterionScores, comment });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError("");
      setNotice(current ? "鑑定を直しました。" : "鑑定を確定しました。本人にお知らせが届きます。");
      router.refresh();
    });
  }

  function again() {
    setNotice("");
    startTransition(async () => {
      const r = await reviewAgainAction(entryId);
      setError(r.ok ? "" : r.error);
      if (r.ok) setNotice("AI の下見をやり直しました。");
      router.refresh();
    });
  }

  return (
    <section id="appraise" className="border-brand01 flex scroll-mt-20 flex-col gap-4 border-2 bg-white p-4 md:p-5" aria-label="鑑定">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-brand01 text-base font-bold">鑑定{current ? "(確定済み。直せます)" : ""}</h2>
        <p className="text-brand04 text-xs">この欄は、鑑定する人にだけ見えています。</p>
      </div>

      {aiReview ? (
        <div className="bg-bg01 flex flex-col gap-2 px-3 py-3 text-sm">
          <p className="text-brand01 font-bold">
            AI の下見: <span className="font-heading text-lg tabular-nums">{scoreOf(aiReview.scores)}</span> 点
          </p>
          <p className="text-ink">{aiReview.summary}</p>
        </div>
      ) : (
        <p className="bg-bg01 text-brand04 px-3 py-3 text-sm">AI の下見はまだありません。点数は自分で付けられます。</p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4">
        {CRITERIA.map((c) => (
          <fieldset key={c} className="flex flex-col gap-1.5">
            <legend className="text-brand01 text-sm font-bold">
              {CRITERION_LABEL[c].label}
              <span className="text-brand04 ml-2 text-xs font-normal">{CRITERION_LABEL[c].hint}</span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: CRITERION_MAX - CRITERION_MIN + 1 }, (_, i) => CRITERION_MIN + i).map((v) => {
                const on = scores[c] === v;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set(c, v)}
                    className={
                      "size-10 border text-sm font-bold tabular-nums transition-colors " +
                      (on ? "bg-brand01 border-brand01 text-white" : "border-brand01/25 text-brand01 hover:border-brand03 bg-white")
                    }
                  >
                    {v}
                  </button>
                );
              })}
            </div>
            {aiReview ? (
              <p className="text-brand04 text-xs">
                AI: {aiReview.scores[c]} — {aiReview.reasons[c]}
              </p>
            ) : null}
          </fieldset>
        ))}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="zukan-appraisal-comment" className="text-brand01 text-sm font-bold">
            講評(任意。本人とみんなに見えます)
          </label>
          <textarea
            id="zukan-appraisal-comment"
            rows={2}
            maxLength={APPRAISAL_COMMENT_MAX}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="よかったところを、ひとこと"
            className={`${FIELD_CLASS} resize-y`}
          />
        </div>

        <p className="text-brand01 text-sm">
          {total === null ? (
            "4 つすべてに点を付けると、点数とレア度が出ます。"
          ) : (
            <>
              <span className="font-heading text-2xl font-bold tabular-nums">{total}</span> 点 → ★{rarity}(
              {rarity ? RARITY_LABEL[rarity] : ""})
            </>
          )}
        </p>

        <ErrorLine error={error} />
        {notice ? (
          <p role="status" className="text-brand01 text-sm font-bold">
            {notice}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={pending} onClick={again} className={BUTTON_SECONDARY}>
            AI にもう一度見てもらう
          </button>
          <button type="submit" disabled={pending || !complete} className={BUTTON_PRIMARY}>
            {pending ? "保存しています…" : current ? "鑑定を直す" : "鑑定を確定する"}
          </button>
        </div>
      </form>
    </section>
  );
}
