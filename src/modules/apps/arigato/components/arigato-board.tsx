"use client";

import { useState, useTransition } from "react";
import { BUTTON_PRIMARY, FIELD_CLASS, LABEL_CLASS } from "@/modules/core/shared/ui/form";
import { deleteCardAction, sendCardAction, toggleLikeAction } from "../actions";
import { ARIGATO_TAGS, ARIGATO_TAG_LABEL, MESSAGE_MAX_LENGTH, type ArigatoTag } from "../constants";
import type { CardRow, Recipient, WeekStatus } from "../queries";

// ありがとうカードの画面(docs/DESIGN.md 26 章)。「みんな」「送る」「自分あて」の 3 つのタブ。

type Tab = "feed" | "send" | "mine";

const TAB_LABEL: Record<Tab, string> = { feed: "みんな", send: "送る", mine: "自分あて" };

const TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function CardItem({
  card,
  viewerId,
  canManage,
  onChange,
  onDelete,
}: {
  card: CardRow;
  viewerId: string;
  canManage: boolean;
  onChange: (card: CardRow) => void;
  onDelete: (id: string, myPoints: number) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const isMine = card.fromUserId === viewerId;
  const canDelete = isMine || canManage;

  function like() {
    startTransition(async () => {
      const r = await toggleLikeAction(card.id);
      onChange({ ...card, likedByMe: r.liked, likeCount: r.likeCount });
    });
  }

  function remove() {
    startTransition(async () => {
      const r = await deleteCardAction(card.id);
      onDelete(card.id, r.myPoints);
    });
  }

  return (
    <li className="border-brand01/15 flex flex-col gap-2 border bg-white px-4 py-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
        <span>{card.fromName}</span>
        <span className="text-brand04 font-normal" aria-label="から">
          →
        </span>
        <span>{card.toName}</span>
        <span className="bg-bg01 text-brand01 px-2 text-xs leading-5">{ARIGATO_TAG_LABEL[card.tag]}</span>
        {card.visibility === "private" ? (
          <span className="border-brand04/40 text-brand04 border px-1.5 text-xs leading-5 font-medium">本人にだけ</span>
        ) : null}
      </p>
      <p className="text-brand01 break-words whitespace-pre-wrap">{card.message}</p>
      <div className="text-brand04 flex items-center gap-3 text-xs">
        <time dateTime={card.createdAt}>{TIME_FORMAT.format(new Date(card.createdAt))}</time>
        <span className="flex-1" />
        {canDelete ? (
          confirming ? (
            <span className="flex items-center gap-2">
              <span>{isMine ? "取り消しますか" : "削除しますか(記録が残ります)"}</span>
              <button type="button" onClick={remove} disabled={pending} className="text-brand03 font-bold">
                {isMine ? "取り消す" : "削除する"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-brand01">
                やめる
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="hover:text-brand03">
              {isMine ? "取り消す" : "削除"}
            </button>
          )
        ) : null}
        {card.visibility === "public" ? (
          <button
            type="button"
            onClick={like}
            disabled={pending}
            aria-pressed={card.likedByMe}
            className={
              "border px-2.5 py-0.5 transition-colors " +
              (card.likedByMe ? "border-brand03 text-brand03 font-bold" : "border-brand01/20 text-brand01 hover:border-brand03")
            }
          >
            いいね {card.likeCount}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function CardList({
  cards,
  empty,
  ...rest
}: {
  cards: CardRow[];
  empty: string;
  viewerId: string;
  canManage: boolean;
  onChange: (card: CardRow) => void;
  onDelete: (id: string, myPoints: number) => void;
}) {
  if (cards.length === 0) return <p className="bg-bg01 text-brand01 px-4 py-6 text-center text-sm">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {cards.map((c) => (
        <CardItem key={c.id} card={c} {...rest} />
      ))}
    </ul>
  );
}

function WeeklyPrompt({ week, onSend }: { week: WeekStatus; onSend: () => void }) {
  return (
    <section className="border-brand03 flex flex-col gap-3 border-2 bg-white px-4 py-4" aria-labelledby="weekly-heading">
      <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">THIS WEEK</p>
      <h2 id="weekly-heading" className="text-brand01 text-lg font-bold">
        今週の一枚を送りませんか
      </h2>
      <p className="text-brand01 text-sm">
        先週、だれかに教わったことや、助けられたことはありましたか。
        {week.lastWeekCount > 0 ? (
          <>
            {" "}
            先週は社内で {week.lastWeekCount} 枚。いちばん多かったのは「
            {week.lastWeekTopTag ? ARIGATO_TAG_LABEL[week.lastWeekTopTag] : ""}」でした。
          </>
        ) : null}
      </p>
      <button type="button" onClick={onSend} className={`${BUTTON_PRIMARY} self-start`}>
        今週の一枚を送る
      </button>
    </section>
  );
}

function SendForm({
  recipients,
  onSent,
}: {
  recipients: Recipient[];
  onSent: (card: CardRow, myPoints: number) => void;
}) {
  const [toUserId, setToUserId] = useState("");
  const [tag, setTag] = useState<ArigatoTag | "">("");
  const [message, setMessage] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const ready = toUserId !== "" && tag !== "" && message.trim() !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const selectedTag = tag;
    setError("");
    startTransition(async () => {
      const r = await sendCardAction({ toUserId, tag: selectedTag, message, visibility: isPrivate ? "private" : "public" });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setToUserId("");
      setTag("");
      setMessage("");
      setIsPrivate(false);
      onSent(r.card, r.myPoints);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <label htmlFor="arigato-to" className={LABEL_CLASS}>
          だれに
        </label>
        <select id="arigato-to" value={toUserId} onChange={(e) => setToUserId(e.target.value)} className={FIELD_CLASS}>
          <option value="">選んでください</option>
          {recipients.map((r) => (
            <option key={r.userId} value={r.userId}>
              {r.name}
              {r.departmentName ? `(${r.departmentName})` : ""}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className={LABEL_CLASS}>どんなこと</legend>
        <div className="flex flex-wrap gap-2">
          {ARIGATO_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tag === t}
              onClick={() => setTag(t)}
              className={
                "border px-3 py-1.5 text-sm transition-colors " +
                (tag === t ? "bg-brand01 border-brand01 font-bold text-white" : "border-brand01/20 text-brand01 hover:border-brand03 bg-white")
              }
            >
              {ARIGATO_TAG_LABEL[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="arigato-message" className={LABEL_CLASS}>
          ひとこと
        </label>
        <textarea
          id="arigato-message"
          rows={4}
          maxLength={MESSAGE_MAX_LENGTH}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="例: 曲げの段取りを、図を描いて教えてくれてありがとうございました。"
          className={`${FIELD_CLASS} resize-y`}
        />
        <p className="text-brand04 mt-1 text-right text-xs tabular-nums">
          {message.length} / {MESSAGE_MAX_LENGTH}
        </p>
      </div>

      <label className="text-brand01 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="accent-brand01 mt-1"
        />
        <span>
          本人にだけ見せる
          <span className="text-brand04 block text-xs">チェックしないと、ポータルのみんなが読めます。</span>
        </span>
      </label>

      {error ? (
        <p role="alert" className="text-brand03 text-sm font-bold">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={!ready || pending} className={`${BUTTON_PRIMARY} py-3`}>
        {pending ? "送っています…" : "ありがとうを送る"}
      </button>
    </form>
  );
}

export function ArigatoBoard({
  viewerId,
  canManage,
  recipients,
  initialFeed,
  initialReceived,
  initialWeek,
  initialMyPoints,
}: {
  viewerId: string;
  canManage: boolean;
  recipients: Recipient[];
  initialFeed: CardRow[];
  initialReceived: CardRow[];
  initialWeek: WeekStatus;
  initialMyPoints: number;
}) {
  const [tab, setTab] = useState<Tab>("feed");
  const [feed, setFeed] = useState(initialFeed);
  const [received, setReceived] = useState(initialReceived);
  const [week, setWeek] = useState(initialWeek);
  const [toast, setToast] = useState("");
  const [myPoints, setMyPoints] = useState(initialMyPoints);

  const replace = (card: CardRow) => {
    const swap = (list: CardRow[]) => list.map((c) => (c.id === card.id ? card : c));
    setFeed(swap);
    setReceived(swap);
  };
  const remove = (id: string, points: number) => {
    setMyPoints(points);
    setFeed((list) => list.filter((c) => c.id !== id));
    setReceived((list) => list.filter((c) => c.id !== id));
  };
  const sent = (card: CardRow, points: number) => {
    setMyPoints(points);
    setFeed((list) => [card, ...list]);

    setWeek((w) => ({ ...w, sentThisWeek: true, thisWeekCount: w.thisWeekCount + 1 }));
    setToast(`${card.toName}さんにありがとうを送りました。`);
    setTab("feed");
  };

  const listProps = { viewerId, canManage, onChange: replace, onDelete: remove };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-bg01 text-brand01 px-4 py-3 text-sm">
        <p>
          今月あなたが伝えたありがとう
          <span className="font-heading mx-1.5 text-2xl font-bold tabular-nums">{myPoints}</span>点
        </p>
        <p className="text-brand04 text-xs">1 枚 1 点。同じ相手には 1 日 1 点までです。</p>
      </div>

      {!week.sentThisWeek && tab !== "send" ? <WeeklyPrompt week={week} onSend={() => setTab("send")} /> : null}

      <div role="tablist" aria-label="表示の切り替え" className="border-brand01/15 flex border-b">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            id={`arigato-tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`arigato-panel-${t}`}
            onClick={() => {
              setTab(t);
              setToast("");
            }}
            className={
              "-mb-px flex-1 border-b-[3px] px-2 py-2.5 text-sm font-bold transition-colors sm:flex-none sm:px-6 " +
              (tab === t ? "border-brand03 text-brand01" : "text-brand04 hover:text-brand01 border-transparent")
            }
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {toast ? (
        <p role="status" className="bg-bg01 text-brand01 px-4 py-3 text-sm font-bold">
          {toast}
        </p>
      ) : null}

      <div role="tabpanel" id={`arigato-panel-${tab}`} aria-labelledby={`arigato-tab-${tab}`}>
        {tab === "feed" ? (
          <div className="flex flex-col gap-4">
            <p className="text-brand04 text-sm">
              今週、社内で送られたありがとう
              <span className="font-heading text-brand01 mx-1.5 text-2xl font-bold tabular-nums">{week.thisWeekCount}</span>枚
            </p>
            <CardList cards={feed} empty="まだカードはありません。最初の一枚を送ってみてください。" {...listProps} />
          </div>
        ) : null}
        {tab === "send" ? <SendForm recipients={recipients} onSent={sent} /> : null}
        {tab === "mine" ? (
          <div className="flex flex-col gap-4">
            <p className="text-brand04 text-sm">
              これまでに受け取ったありがとう
              <span className="font-heading text-brand01 mx-1.5 text-2xl font-bold tabular-nums">{received.length}</span>枚
            </p>
            <CardList cards={received} empty="受け取ったカードは、ここに並びます。" {...listProps} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
