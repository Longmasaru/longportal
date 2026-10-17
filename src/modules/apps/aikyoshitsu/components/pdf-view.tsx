"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

// PDF を、ブラウザの中で全ページ描く(pdf.js)。元の PDF をそのまま表示し、加工はしない。
// 幅は表示欄に合わせ、zoom(%)で拡大・縮小する。

type Status = { state: "loading" } | { state: "ready"; pages: number } | { state: "error" };

// 社員のスマホやタブレットの古いブラウザでも開けるよう、互換用の legacy ビルドを使う
// (通常ビルドは最新のブラウザにしかない機能を使うため)。
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}

export function PdfView({ url, zoom, title }: { url: string; zoom: number; title: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [width, setWidth] = useState(0);

  // 読み込み(url が変わると、親が key で作り直す)
  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    loadPdfjs()
      .then((pdfjs) => {
        if (cancelled) return null;
        const loading = pdfjs.getDocument({ url, disableRange: true, disableStream: true });
        task = loading;
        return loading.promise;
      })
      .then((d) => {
        if (!d || cancelled) return;
        setDoc(d);
        setStatus({ state: "ready", pages: d.numPages });
      })
      .catch((err) => {
        console.error("[aikyoshitsu] PDF の読み込みに失敗しました", err);
        if (!cancelled) setStatus({ state: "error" });
      });
    return () => {
      cancelled = true;
      if (task) void task.destroy();
    };
  }, [url]);

  // 表示欄の幅
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // 描画
  useEffect(() => {
    const host = pagesRef.current;
    if (!doc || !host || width === 0) return;
    let cancelled = false;
    const tasks: { cancel: () => void }[] = [];
    const target = Math.round(Math.min(width, 1000) * (zoom / 100));
    const ratio = window.devicePixelRatio || 1;
    host.replaceChildren();
    (async () => {
      for (let n = 1; n <= doc.numPages; n++) {
        if (cancelled) return;
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: target / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.className = "block bg-white shadow-md";
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${title} ${n}ページ目`);
        const label = document.createElement("p");
        label.className = "text-brand04 mt-1.5 mb-4 text-center text-xs";
        label.textContent = `${n} / ${doc.numPages}`;
        host.append(canvas, label);
        const task = page.render({
          canvas,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        tasks.push(task);
        await task.promise.catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
      tasks.forEach((t) => t.cancel());
    };
  }, [doc, width, zoom, title]);

  return (
    <div ref={boxRef} className="w-full">
      {status.state === "loading" ? <p className="text-brand04 py-10 text-center text-sm">資料を読み込んでいます…</p> : null}
      {status.state === "error" ? (
        <p className="text-brand03 py-10 text-center text-sm font-bold">
          資料を開けませんでした。もう一度選ぶか、ページを読み込み直してください。
        </p>
      ) : null}
      <div ref={pagesRef} className={`flex flex-col ${zoom > 100 ? "items-start" : "items-center"}`} />
    </div>
  );
}
