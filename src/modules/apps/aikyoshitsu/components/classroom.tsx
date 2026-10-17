"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMaterialUrlAction } from "../actions";
import { isPdf } from "../policy";
import type { MaterialRow, SessionRow } from "../queries";
import { ManagePanel } from "./manage-panel";
import { PdfView } from "./pdf-view";

// AI教室の画面。Google ドライブのように、左に回と資料の一覧、右に資料の中身(元のファイルをそのまま)。
// 全画面ボタンで、講習のときに大きく映せる(Fullscreen API。使えない端末では画面いっぱいの表示にする)。

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300];

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function heldOnLabel(heldOn: string | null) {
  if (!heldOn) return "日程未定";
  const [y, m, d] = heldOn.split("-").map(Number);
  const w = "日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}月${d}日(${w})`;
}

function FileIcon({ contentType }: { contentType: string }) {
  const pdf = isPdf(contentType);
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <path d="M6 2h9l5 5v15H6z" className={pdf ? "fill-brand03/10 stroke-brand03" : "fill-bg01 stroke-brand01"} strokeWidth="1.5" />
      <text x="13" y="17" textAnchor="middle" fontSize="5.5" fontWeight="700" className={pdf ? "fill-brand03" : "fill-brand01"}>
        {pdf ? "PDF" : "IMG"}
      </text>
    </svg>
  );
}

type Opened = { material: MaterialRow; url: string } | { material: MaterialRow; error: true } | null;

export function Classroom({ sessions, canManage }: { sessions: SessionRow[]; canManage: boolean }) {
  const firstMaterial = sessions.flatMap((s) => s.materials)[0] ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(firstMaterial?.id ?? null);
  const [opened, setOpened] = useState<Opened>(null);
  const [zoom, setZoom] = useState(100);
  const [fullscreen, setFullscreen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const allMaterials = sessions.flatMap((s) => s.materials);
  // 選んだ資料が消えたら(削除など)、最初の資料を表示する
  const selected = allMaterials.find((m) => m.id === selectedId) ?? allMaterials[0] ?? null;

  // 資料を開く(署名付き URL をもらう)
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    getMaterialUrlAction(selected.id)
      .then((url) => {
        if (!cancelled) setOpened({ material: selected, url });
      })
      .catch(() => {
        if (!cancelled) setOpened({ material: selected, error: true });
      });
    return () => {
      cancelled = true;
    };
    // selected は id が同じなら同じ資料
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // 全画面
  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setFullscreen(false);
  }, []);
  const enterFullscreen = useCallback(() => {
    setFullscreen(true);
    const el = rootRef.current;
    if (el?.requestFullscreen) void el.requestFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const zoomBy = (dir: 1 | -1) => {
    const i = ZOOM_STEPS.indexOf(zoom);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir))];
    setZoom(next);
  };

  const choose = (id: string) => {
    setSelectedId(id);
    setListOpen(false);
    setManaging(false);
  };

  const sessionOf = (id: string) => sessions.find((s) => s.materials.some((m) => m.id === id));

  return (
    <div
      ref={rootRef}
      className={`bg-bg01 flex flex-col ${
        fullscreen ? "fixed inset-0 z-50 h-dvh" : "h-[calc(100dvh-3.5rem)] md:grid md:grid-cols-[17rem_1fr]"
      }`}
    >
      {/* 一覧(スマホでは開閉する) */}
      <aside
        aria-label="回と資料の一覧"
        className={`border-brand01/15 flex-col gap-4 overflow-y-auto border-b bg-white p-4 md:max-h-none md:border-r md:border-b-0 ${
          fullscreen ? "hidden" : listOpen ? "flex max-h-[60dvh]" : "hidden md:flex"
        }`}
      >
        <div>
          <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
            AI CLASS<span className="text-brand04 ml-3 font-medium tracking-[0.1em]">社内AI講習会</span>
          </p>
          <h1 className="text-brand01 mt-1 text-lg font-bold">AI教室</h1>
        </div>
        {sessions.length === 0 ? (
          <p className="text-brand04 text-sm">
            まだ資料がありません。{canManage ? "「資料を管理」から、回を作って PDF を追加してください。" : ""}
          </p>
        ) : null}
        {sessions.map((s) => (
          <section key={s.id} className="flex flex-col gap-1">
            <h2 className="text-brand01 flex items-center gap-2 text-sm font-bold">
              <svg viewBox="0 0 24 24" className="text-brand04 h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
                <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
              <span className="min-w-0 break-words">{s.title}</span>
            </h2>
            <p className="text-brand04 pl-6 text-xs">{heldOnLabel(s.heldOn)}</p>
            <ul className="flex flex-col gap-0.5">
              {s.materials.map((m) => {
                const active = m.id === selected?.id && !managing;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => choose(m.id)}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center gap-2.5 px-2 py-2 text-left text-sm transition-colors ${
                        active ? "bg-brand01 text-white" : "text-brand01 hover:bg-bg01"
                      }`}
                    >
                      <FileIcon contentType={m.contentType} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-all font-bold">{m.fileName}</span>
                        <span className={`block text-xs ${active ? "text-white/70" : "text-brand04"}`}>{formatSize(m.size)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {s.materials.length === 0 ? <li className="text-brand04 pl-6 text-xs">資料はまだありません</li> : null}
            </ul>
          </section>
        ))}
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setManaging(true);
              setListOpen(false);
            }}
            className={`border-brand01 mt-auto border px-3 py-2 text-sm font-bold transition-colors ${
              managing ? "bg-brand01 text-white" : "text-brand01 hover:border-brand03 hover:text-brand03 bg-white"
            }`}
          >
            資料を管理
          </button>
        ) : null}
      </aside>

      {/* 中身 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="border-brand01/15 flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2">
          {!fullscreen ? (
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              aria-expanded={listOpen}
              className="border-brand01/30 text-brand01 border px-2.5 py-1.5 text-xs font-bold md:hidden"
            >
              一覧
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            {managing ? (
              <p className="text-brand01 font-bold">資料の管理</p>
            ) : selected ? (
              <p className="text-brand01 truncate font-bold" title={selected.fileName}>
                <span className="text-brand04 mr-2 text-xs font-normal">{sessionOf(selected.id)?.title}</span>
                {selected.fileName}
              </p>
            ) : (
              <p className="text-brand04 text-sm">資料を選んでください</p>
            )}
          </div>
          {!managing && selected ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => zoomBy(-1)}
                disabled={zoom === ZOOM_STEPS[0]}
                aria-label="縮小"
                className="border-brand01/30 text-brand01 h-9 w-9 border text-lg font-bold disabled:opacity-40"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setZoom(100)}
                className="text-brand04 w-12 text-center text-xs tabular-nums"
                title="100%に戻す"
              >
                {zoom}%
              </button>
              <button
                type="button"
                onClick={() => zoomBy(1)}
                disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                aria-label="拡大"
                className="border-brand01/30 text-brand01 h-9 w-9 border text-lg font-bold disabled:opacity-40"
              >
                ＋
              </button>
              <button
                type="button"
                onClick={fullscreen ? exitFullscreen : enterFullscreen}
                className="bg-brand01 ml-1 h-9 px-3 text-sm font-bold text-white transition-opacity hover:opacity-80"
              >
                {fullscreen ? "全画面を終わる" : "全画面"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3 md:p-6">
          {managing ? (
            <ManagePanel sessions={sessions} />
          ) : !selected ? (
            <p className="text-brand04 py-10 text-center text-sm">左の一覧から資料を選んでください。</p>
          ) : !opened || opened.material.id !== selected.id ? (
            <p className="text-brand04 py-10 text-center text-sm">資料を読み込んでいます…</p>
          ) : "error" in opened ? (
            <p className="text-brand03 py-10 text-center text-sm font-bold">資料を開けませんでした。もう一度選んでください。</p>
          ) : isPdf(opened.material.contentType) ? (
            <PdfView key={opened.url} url={opened.url} zoom={zoom} title={opened.material.fileName} />
          ) : (
            <div className={`flex ${zoom > 100 ? "justify-start" : "justify-center"}`}>
              {/* 署名付き URL の画像(R2)。最適化の対象外なので img を使う。 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={opened.url}
                alt={opened.material.fileName}
                className="block h-auto max-w-none bg-white shadow-md"
                style={{ width: `${10 * zoom}px`, maxWidth: zoom > 100 ? "none" : "100%" }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
