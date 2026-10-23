"use client";

import { useRef, useState } from "react";
import { BUTTON_SECONDARY, LABEL_CLASS } from "../../shared/ui/form";
import { createNoticeUploadUrlAction } from "../actions";
import { MAX_NOTICE_ATTACHMENTS, MAX_NOTICE_ATTACHMENT_MB, attachmentProblem } from "../constants";
import { formatFileSize } from "../file-size";

export type ExistingAttachment = { id: string; fileName: string; size: number };
type Added = { key: string; fileName: string; size: number };

/**
 * お知らせの添付ファイルの欄(docs/DESIGN.md 23.1)。選んだファイルは、その場で保管先(R2)へ直接アップロードし、
 * 「公開する」「下書きとして保存」を押したときに、お知らせに結び付ける(結び付けるのはサーバーで確かめてから)。
 */
export function AttachmentsField({
  existing,
  onBusyChange,
}: {
  existing: ExistingAttachment[];
  onBusyChange: (busy: boolean) => void;
}) {
  const [kept, setKept] = useState(existing);
  const [added, setAdded] = useState<Added[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ tone: "ok" | "error"; text: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const count = kept.length + added.length;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const notes: { tone: "ok" | "error"; text: string }[] = [];
    let room = MAX_NOTICE_ATTACHMENTS - count;
    onBusyChange(true);
    for (const file of Array.from(files)) {
      if (room <= 0) {
        notes.push({ tone: "error", text: `添付ファイルは ${MAX_NOTICE_ATTACHMENTS} 個までです。${file.name} は付けませんでした。` });
        continue;
      }
      const problem = attachmentProblem({ name: file.name, size: file.size });
      if (problem) {
        notes.push({ tone: "error", text: problem });
        continue;
      }
      setUploading(file.name);
      try {
        const contentType = file.type || "application/octet-stream";
        const target = await createNoticeUploadUrlAction({ fileName: file.name, size: file.size, contentType });
        if ("error" in target) {
          notes.push({ tone: "error", text: target.error });
          continue;
        }
        const put = await fetch(target.url, { method: "PUT", body: file, headers: { "Content-Type": contentType } });
        if (!put.ok) throw new Error("upload failed");
        setAdded((prev) => [...prev, { key: target.key, fileName: file.name, size: file.size }]);
        room -= 1;
        notes.push({ tone: "ok", text: `${file.name} をアップロードしました。` });
      } catch {
        notes.push({ tone: "error", text: `${file.name} のアップロードに失敗しました。もう一度お試しください。` });
      }
    }
    setUploading(null);
    setMessages(notes);
    onBusyChange(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <input
        type="hidden"
        name="attachments"
        value={JSON.stringify({ keep: kept.map((k) => k.id), add: added.map((a) => ({ key: a.key, fileName: a.fileName })) })}
      />
      <p className={LABEL_CLASS}>
        添付ファイル<span className="text-brand04 ml-2 font-normal">{count} / {MAX_NOTICE_ATTACHMENTS}</span>
      </p>
      {count > 0 ? (
        <ul className="border-brand01/15 mb-2 border-y">
          {kept.map((f) => (
            <FileRow
              key={f.id}
              name={f.fileName}
              size={f.size}
              onRemove={() => setKept((prev) => prev.filter((k) => k.id !== f.id))}
            />
          ))}
          {added.map((f) => (
            <FileRow
              key={f.key}
              name={f.fileName}
              size={f.size}
              fresh
              onRemove={() => setAdded((prev) => prev.filter((a) => a.key !== f.key))}
            />
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${BUTTON_SECONDARY} cursor-pointer ${uploading || count >= MAX_NOTICE_ATTACHMENTS ? "pointer-events-none opacity-50" : ""}`}>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            disabled={uploading !== null || count >= MAX_NOTICE_ATTACHMENTS}
            onChange={(e) => void upload(e.target.files)}
          />
          {uploading ? `アップロード中… ${uploading}` : "ファイルを選ぶ"}
        </label>
        <span className="text-brand04 text-xs">
          PDF・写真・Excel など。1 つ {MAX_NOTICE_ATTACHMENT_MB}MB まで、{MAX_NOTICE_ATTACHMENTS} 個まで。
        </span>
      </div>
      {messages.length > 0 ? (
        <ul aria-live="polite" className="mt-2 flex flex-col gap-0.5 text-sm">
          {messages.map((m, i) => (
            <li key={i} className={m.tone === "ok" ? "text-link font-bold" : "text-brand03 font-bold"}>
              {m.text}
            </li>
          ))}
        </ul>
      ) : null}
      {added.length > 0 || kept.length !== existing.length ? (
        <p className="text-brand04 mt-1 text-xs">添付の変更は、「公開する」か「下書きとして保存」を押すと反映されます。</p>
      ) : null}
    </div>
  );
}

function FileRow({ name, size, fresh, onRemove }: { name: string; size: number; fresh?: boolean; onRemove: () => void }) {
  return (
    <li className="border-brand04/30 flex items-center gap-3 border-b px-1 py-2 text-sm last:border-b-0">
      <span aria-hidden="true">📎</span>
      <span className="text-brand01 min-w-0 flex-1 truncate">{name}</span>
      {fresh ? <span className="text-link shrink-0 text-xs font-bold">追加</span> : null}
      <span className="text-brand04 shrink-0 text-xs tabular-nums">{formatFileSize(size)}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-brand04 hover:text-brand03 shrink-0 text-xs font-bold transition-colors"
        aria-label={`${name} を外す`}
      >
        外す
      </button>
    </li>
  );
}
