"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { markNoticeReadAction } from "../../../notices/actions";
import { splitBodyLinks } from "../../../notices/logic";
import { formatDateDot } from "../../../shared/format";
import type { Notice } from "../../types";

/** プレビュー(3 行)に収まらないとみなす目安。超えるときだけ「続きを読む」を出す。 */
function isLongBody(body: string): boolean {
  return body.length > 100 || body.split("\n").length > 3;
}

/**
 * ホームのお知らせの 1 件。本文の先頭(3 行まで)を見せ、「続きを読む」でその場で全文を開く。
 * 開いたら既読にする(詳細の画面を開いたときと同じ)。確認ボタンなどは、件名から開く詳細の画面にある。
 * 既読にしたら、「閉じる」かホームを離れるときに画面を取り直し、サイドバーの未読の数も更新する
 * (読んでいる途中で一覧から消えないよう、開いている間は取り直さない)。
 */
export function NoticeItem({ notice, kindLabel }: { notice: Notice; kindLabel: string }) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(notice.isRead);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const long = isLongBody(notice.body);
  const bodyId = `notice-body-${notice.id}`;
  /** ここで既読にした / その保存が済んだ / 閉じたので取り直したい / 取り直し済み */
  const markedHere = useRef(false);
  const saved = useRef(false);
  const wantRefresh = useRef(false);
  const refreshed = useRef(false);

  const refreshOnce = () => {
    if (refreshed.current) return;
    refreshed.current = true;
    router.refresh();
  };

  // ホームを離れるとき(この項目が消えるとき)に、既読にしていれば取り直す。
  useEffect(
    () => () => {
      if (markedHere.current && !refreshed.current) {
        refreshed.current = true;
        router.refresh();
      }
    },
    [router],
  );

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!read) {
      setRead(true);
      markedHere.current = true;
      startTransition(async () => {
        await markNoticeReadAction(notice.id);
        saved.current = true;
        if (wantRefresh.current) refreshOnce();
      });
    }
    if (!next && markedHere.current) {
      // 保存がまだなら、済んだときに取り直す
      if (saved.current) refreshOnce();
      else wantRefresh.current = true;
    }
  };

  return (
    <li className="border-brand04/40 flex items-start gap-3 border-b py-3.5 first:border-t md:gap-5">
      <time
        dateTime={notice.publishedOn}
        className="font-heading text-brand04 w-[5.5rem] shrink-0 pt-0.5 text-sm tracking-[0.05em] md:w-24"
      >
        {formatDateDot(notice.publishedOn)}
      </time>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {notice.target === "company" ? (
            <span className="border-brand01 text-brand01 border px-1.5 text-xs leading-[1.125rem] font-bold">全社</span>
          ) : null}
          {notice.priority !== "normal" ? (
            <span className="bg-brand03/15 text-brand03 px-1.5 text-xs leading-5 font-bold">
              {notice.priority === "urgent" ? "緊急" : "重要"}
            </span>
          ) : null}
          {notice.requiresAction ? (
            <span className="bg-brand03 px-1.5 text-xs leading-5 font-bold text-white">要対応</span>
          ) : null}
          <span className="bg-field text-brand04 px-1.5 text-xs leading-5">{kindLabel}</span>
          {notice.attachmentCount > 0 ? (
            <span className="text-brand04 text-xs font-bold">📎 添付 {notice.attachmentCount}</span>
          ) : null}
          {!read ? (
            <span className="text-link flex items-center gap-1 text-xs font-bold">
              <span aria-hidden="true" className="bg-link size-1.5 rounded-full" />
              未読
            </span>
          ) : null}
        </p>
        <Link href={notice.href} className="text-brand01 hover:text-brand03 mt-1 block font-bold transition-colors">
          {notice.title}
        </Link>
        {notice.body ? (
          <div
            id={bodyId}
            className={`text-brand04 mt-1 text-sm leading-relaxed break-words whitespace-pre-line ${
              open ? "text-brand01" : "line-clamp-3"
            }`}
          >
            {open
              ? splitBodyLinks(notice.body).map((part, i) =>
                  part.type === "link" ? (
                    <a
                      key={i}
                      href={part.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-link hover:text-brand03 break-all underline transition-colors"
                    >
                      {part.url}
                    </a>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )
              : notice.body}
          </div>
        ) : null}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {long ? (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-controls={bodyId}
              className="text-brand01 hover:text-brand03 font-bold transition-colors"
            >
              {open ? "閉じる" : "続きを読む"}
            </button>
          ) : null}
          <Link href={notice.href} className="text-brand04 hover:text-brand03 font-bold transition-colors">
            {notice.requiresAction ? "開いて確認する ›" : "詳しく見る ›"}
          </Link>
        </p>
      </div>
    </li>
  );
}
