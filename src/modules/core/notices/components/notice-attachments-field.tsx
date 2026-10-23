"use client";

import { useEffect, useRef, useState } from "react";
import { BUTTON_SECONDARY, LABEL_CLASS } from "../../shared/ui/form";
import { createNoticeAttachmentUploadUrlAction } from "../actions";
import {
  NOTICE_ATTACHMENT_EXTENSIONS,
  NOTICE_ATTACHMENT_MAX_BYTES,
  NOTICE_ATTACHMENT_MAX_COUNT,
} from "../constants";
import { formatFileSize, isAllowedNoticeAttachment, isInlineNoticeImage } from "../logic";
import type { NoticeAttachment } from "../queries";

type Item =
  | ({ kind: "saved" } & NoticeAttachment)
  | { kind: "new"; key: string; fileName: string; contentType: string; size: number; previewUrl: string | null };

const MAX_MB = NOTICE_ATTACHMENT_MAX_BYTES / 1024 / 1024;
const ACCEPT = NOTICE_ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(",");

/**
 * お知らせのファイル・写真(ブラウザから R2 へ直接送る)。保存はまだせず、並びを hidden の attachments で
 * フォームと一緒に送る(既にある添付は id、新しく送ったものはキーと元の名前)。外したものは保存のときに消える。
 */
export function NoticeAttachmentsField({
  initial,
  onUploadingChange,
}: {
  initial: NoticeAttachment[];
  /** 送信中は、フォームの保存ボタンを止める(送り終わる前に保存すると、ファイルが付かないため)。 */
  onUploadingChange: (uploading: boolean) => void;
}) {
  const [items, setItems] = useState<Item[]>(initial.map((a) => ({ kind: "saved", ...a })));
  const [uploading, setUploadingState] = useState(false);
  const setUploading = (v: boolean) => {
    setUploadingState(v);
    onUploadingChange(v);
  };
  const [errors, setErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useRef<string[]>([]);

  // 画面を離れたら、写真の下見に使った一時的な URL を片付ける。
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const messages: string[] = [];
    let room = NOTICE_ATTACHMENT_MAX_COUNT - items.length;
    for (const file of Array.from(files)) {
      if (room <= 0) {
        messages.push(`添付は ${NOTICE_ATTACHMENT_MAX_COUNT} 個までです。`);
        break;
      }
      if (!isAllowedNoticeAttachment(file.name)) {
        messages.push(`${file.name}: この種類のファイルは付けられません。`);
        continue;
      }
      if (file.size > NOTICE_ATTACHMENT_MAX_BYTES) {
        messages.push(`${file.name}: ${MAX_MB}MB を超えています。`);
        continue;
      }
      try {
        const r = await createNoticeAttachmentUploadUrlAction({
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        });
        if (!r.ok) {
          messages.push(`${file.name}: ${r.error}`);
          continue;
        }
        const put = await fetch(r.url, { method: "PUT", body: file, headers: { "Content-Type": r.contentType } });
        if (!put.ok) throw new Error("upload failed");
        let previewUrl: string | null = null;
        if (isInlineNoticeImage(r.contentType)) {
          previewUrl = URL.createObjectURL(file);
          previews.current.push(previewUrl);
        }
        setItems((prev) => [
          ...prev,
          { kind: "new", key: r.key, fileName: file.name, contentType: r.contentType, size: file.size, previewUrl },
        ]);
        room -= 1;
      } catch {
        messages.push(`${file.name}: 送れませんでした。もう一度お試しください。`);
      }
    }
    setErrors(messages);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const move = (index: number, delta: number) =>
    setItems((prev) => {
      const next = [...prev];
      const to = index + delta;
      if (to < 0 || to >= next.length) return prev;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const remove = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  return (
    <div>
      <p className={LABEL_CLASS}>
        ファイル・写真
        <span className="text-brand04 ml-2 font-normal">
          {items.length} / {NOTICE_ATTACHMENT_MAX_COUNT}
        </span>
      </p>
      <p className="text-brand04 mb-2 text-xs">
        写真はお知らせの中にそのまま表示され、PDF・Word・Excel などは名前を押して開けます(1 つ {MAX_MB}MB まで)。
        外したファイルは、保存したときに消えます。
      </p>
      {items.map((item) => (
        <input
          key={item.kind === "saved" ? item.id : item.key}
          type="hidden"
          name="attachments"
          value={JSON.stringify(item.kind === "saved" ? { id: item.id } : { key: item.key, fileName: item.fileName })}
        />
      ))}
      {items.length > 0 ? (
        <ul className="mb-2 flex flex-col gap-1.5">
          {items.map((item, i) => {
            const thumb =
              item.kind === "new"
                ? item.previewUrl
                : isInlineNoticeImage(item.contentType)
                  ? `/notices/files/${item.id}`
                  : null;
            return (
              <li key={item.kind === "saved" ? item.id : item.key} className="bg-bg01 flex items-center gap-3 px-3 py-2 text-sm">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 下見(一時的な URL か、見てよい人だけ転送する入口)
                  <img src={thumb} alt="" className="bg-field size-10 shrink-0 object-cover" />
                ) : (
                  <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center text-lg">
                    📎
                  </span>
                )}
                <span className="text-brand01 min-w-0 flex-1 truncate" title={item.fileName}>
                  {item.fileName}
                </span>
                <span className="text-brand04 shrink-0 text-xs">
                  {formatFileSize(item.size)}
                  {item.kind === "new" ? "・未保存" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`${item.fileName}を上へ`}
                  className="text-brand04 hover:text-brand03 shrink-0 transition-colors disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  aria-label={`${item.fileName}を下へ`}
                  className="text-brand04 hover:text-brand03 shrink-0 transition-colors disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`${item.fileName}を外す`}
                  className="text-brand04 hover:text-brand03 shrink-0 transition-colors"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {errors.length > 0 ? (
        <ul className="text-brand03 mb-2 text-xs" role="alert">
          {errors.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      ) : null}
      <input ref={inputRef} type="file" multiple hidden accept={ACCEPT} onChange={(e) => upload(e.target.files)} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || items.length >= NOTICE_ATTACHMENT_MAX_COUNT}
        className={BUTTON_SECONDARY}
      >
        {uploading ? "送信中…" : "ファイル・写真を追加"}
      </button>
    </div>
  );
}
