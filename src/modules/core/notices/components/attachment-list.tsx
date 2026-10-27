"use client";

import { useState } from "react";
import { getNoticeAttachmentUrlAction } from "../actions";
import { formatFileSize } from "../file-size";

/** お知らせの添付ファイルの一覧(社員の詳細画面・管理画面)。押すと、その場で受け取り用の URL を作って開く。 */
export function AttachmentList({ files }: { files: { id: string; fileName: string; size: number }[] }) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (files.length === 0) return null;

  async function open(id: string) {
    setError(null);
    setOpening(id);
    const result = await getNoticeAttachmentUrlAction(id).catch(() => ({ error: "ファイルを開けませんでした。" }));
    setOpening(null);
    if ("error" in result) setError(result.error);
    else window.location.assign(result.url);
  }

  return (
    <section aria-label="添付ファイル">
      <p className="text-brand01 mb-1 text-sm font-bold">添付ファイル({files.length})</p>
      <ul className="border-brand01/15 border-y">
        {files.map((f) => (
          <li key={f.id} className="border-brand04/30 border-b last:border-b-0">
            <button
              type="button"
              onClick={() => void open(f.id)}
              disabled={opening !== null}
              className="hover:bg-bg01 flex w-full items-center gap-3 px-1 py-2.5 text-left text-sm transition-colors disabled:opacity-60"
            >
              <span aria-hidden="true">📎</span>
              <span className="text-link min-w-0 flex-1 truncate font-bold underline">{f.fileName}</span>
              <span className="text-brand04 shrink-0 text-xs tabular-nums">
                {opening === f.id ? "準備中…" : formatFileSize(f.size)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-brand03 mt-1 text-sm font-bold">
          {error}
        </p>
      ) : null}
    </section>
  );
}
