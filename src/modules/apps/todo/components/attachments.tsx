"use client";

import { useEffect, useRef, useState } from "react";
import { BUTTON_SECONDARY, LABEL_CLASS } from "@/modules/core/shared/ui/form";
import {
  createUploadUrlAction,
  deleteAttachmentAction,
  getDownloadUrlAction,
  listAttachmentsAction,
  registerAttachmentAction,
  type AttachmentRow,
} from "../actions";

const MAX_MB = 25;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** TODO の添付ファイル(ブラウザから R2 へ直接アップロードする)。 */
export function Attachments({ todoId, onMessage }: { todoId: string; onMessage: (message: string, tone?: "success" | "error") => void }) {
  const [items, setItems] = useState<AttachmentRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listAttachmentsAction(todoId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [todoId]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.size > MAX_MB * 1024 * 1024) {
        onMessage(`${file.name} は ${MAX_MB}MB を超えています`, "error");
        continue;
      }
      try {
        const contentType = file.type || "application/octet-stream";
        const { url, key } = await createUploadUrlAction(todoId, { fileName: file.name, size: file.size, contentType });
        const put = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": contentType } });
        if (!put.ok) throw new Error("upload failed");
        const row = await registerAttachmentAction(todoId, key, file.name);
        setItems((prev) => [...prev, row]);
        onMessage(`${file.name} を添付しました`);
      } catch {
        onMessage(`${file.name} のアップロードに失敗しました`, "error");
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const open = async (id: string) => {
    try {
      window.open(await getDownloadUrlAction(id), "_blank", "noopener");
    } catch {
      onMessage("ファイルを開けませんでした", "error");
    }
  };

  const remove = async (id: string) => {
    const prev = items;
    setItems(items.filter((item) => item.id !== id));
    try {
      await deleteAttachmentAction(id);
      onMessage("添付ファイルを削除しました");
    } catch {
      setItems(prev);
      onMessage("削除に失敗しました", "error");
    }
  };

  return (
    <div>
      <p className={LABEL_CLASS}>添付ファイル</p>
      {items.length > 0 ? (
        <ul className="mb-2 flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="bg-bg01 flex items-center gap-3 px-3 py-2 text-sm">
              <button
                type="button"
                onClick={() => open(item.id)}
                className="text-brand01 hover:text-brand03 min-w-0 flex-1 truncate text-left transition-colors"
                title={item.fileName}
              >
                📎 {item.fileName}
              </button>
              <span className="text-brand04 shrink-0 text-xs">{formatSize(item.size)}</span>
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label={`${item.fileName}を削除`}
                className="text-brand04 hover:text-brand03 shrink-0 transition-colors"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={BUTTON_SECONDARY}
      >
        {uploading ? "アップロード中…" : `ファイルを追加(1 つ ${MAX_MB}MB まで)`}
      </button>
    </div>
  );
}
