"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, LABEL_CLASS } from "@/modules/core/shared/ui/form";
import {
  createMaterialUploadUrlAction,
  createSessionAction,
  deleteMaterialAction,
  deleteSessionAction,
  registerMaterialAction,
  renameMaterialAction,
  updateSessionAction,
  type ActionResult,
} from "../actions";
import { MATERIAL_MAX_MB, materialContentType } from "../policy";
import type { MaterialRow, SessionRow } from "../queries";

// 回と資料の管理(aikyoshitsu.materials.manage を持つ人だけに表示。本判定は各 Server Action)。
// 資料は元のファイルをそのままアップロードする(ブラウザから R2 へ直接)。

type Message = { text: string; tone: "success" | "error" } | null;

function MessageLine({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role="status" className={`text-sm font-bold ${message.tone === "error" ? "text-brand03" : "text-brand01"}`}>
      {message.text}
    </p>
  );
}

function SessionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { title: string; heldOn: string };
  submitLabel: string;
  onSubmit: (v: { title: string; heldOn: string }) => Promise<ActionResult>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [heldOn, setHeldOn] = useState(initial.heldOn);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const idBase = useId();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await onSubmit({ title, heldOn });
          if (r.error) setError(r.error);
          else {
            setError(null);
            if (!onCancel) {
              setTitle("");
              setHeldOn("");
            }
          }
        });
      }}
    >
      <div className="min-w-0 flex-1 basis-60">
        <label htmlFor={`${idBase}-title`} className={LABEL_CLASS}>
          回のタイトル
        </label>
        <input
          id={`${idBase}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="例: 第1回 スマホに話しかけてみよう"
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-date`} className={LABEL_CLASS}>
          実施日(任意)
        </label>
        <input id={`${idBase}-date`} type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} className={FIELD_CLASS} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={BUTTON_SECONDARY}>
            やめる
          </button>
        ) : null}
      </div>
      {error ? <p className="text-brand03 w-full text-sm font-bold">{error}</p> : null}
    </form>
  );
}

function MaterialItem({ material, onMessage }: { material: MaterialRow; onMessage: (m: Message) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(material.fileName);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ActionResult>, done: string) =>
    start(async () => {
      const r = await fn();
      if (r.error) onMessage({ text: r.error, tone: "error" });
      else {
        onMessage({ text: done, tone: "success" });
        setEditing(false);
        setConfirming(false);
        router.refresh();
      }
    });

  return (
    <li className="border-brand01/10 flex flex-wrap items-center gap-2 border-t py-2 first:border-t-0">
      {editing ? (
        <>
          <label htmlFor={`m-${material.id}`} className="sr-only">
            資料の名前
          </label>
          <input
            id={`m-${material.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className={`${FIELD_CLASS} min-w-0 flex-1 basis-48`}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => renameMaterialAction(material.id, name), "名前を変えました")}
            className={BUTTON_PRIMARY}
          >
            保存
          </button>
          <button type="button" onClick={() => setEditing(false)} className={BUTTON_SECONDARY}>
            やめる
          </button>
        </>
      ) : confirming ? (
        <>
          <p className="text-brand01 min-w-0 flex-1 text-sm">
            「<b className="break-all">{material.fileName}</b>」を削除します。元に戻せません。
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => deleteMaterialAction(material.id), "資料を削除しました")}
            className="bg-brand03 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            削除する
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={BUTTON_SECONDARY}>
            やめる
          </button>
        </>
      ) : (
        <>
          <span className="text-brand01 min-w-0 flex-1 text-sm font-bold break-all">{material.fileName}</span>
          <button type="button" onClick={() => setEditing(true)} className={BUTTON_SECONDARY}>
            名前を変える
          </button>
          <button type="button" onClick={() => setConfirming(true)} className={BUTTON_SECONDARY}>
            削除
          </button>
        </>
      )}
    </li>
  );
}

function SessionCard({ session, onMessage }: { session: SessionRow; onMessage: (m: Message) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    let added = 0;
    for (const file of Array.from(files)) {
      const contentType = materialContentType(file.name, file.type);
      if (!contentType) {
        onMessage({ text: `${file.name} は PDF・PNG・JPEG ではないため、追加できません`, tone: "error" });
        continue;
      }
      if (file.size > MATERIAL_MAX_MB * 1024 * 1024) {
        onMessage({ text: `${file.name} は ${MATERIAL_MAX_MB}MB を超えています`, tone: "error" });
        continue;
      }
      try {
        const r = await createMaterialUploadUrlAction(session.id, { fileName: file.name, size: file.size, contentType });
        if ("error" in r && r.error) {
          onMessage({ text: r.error, tone: "error" });
          continue;
        }
        if (!("url" in r)) continue;
        const put = await fetch(r.url, { method: "PUT", body: file, headers: { "Content-Type": r.contentType } });
        if (!put.ok) throw new Error(`upload failed: ${put.status}`);
        const reg = await registerMaterialAction(session.id, r.key, file.name);
        if (reg.error) {
          onMessage({ text: reg.error, tone: "error" });
          continue;
        }
        added++;
      } catch {
        onMessage({ text: `${file.name} のアップロードに失敗しました`, tone: "error" });
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (added > 0) {
      onMessage({ text: `${added}件の資料を追加しました`, tone: "success" });
      router.refresh();
    }
  };

  return (
    <section className="border-brand01/15 flex flex-col gap-3 border bg-white p-4">
      {editing ? (
        <SessionForm
          initial={{ title: session.title, heldOn: session.heldOn ?? "" }}
          submitLabel="保存"
          onCancel={() => setEditing(false)}
          onSubmit={async (v) => {
            const r = await updateSessionAction(session.id, v);
            if (!r.error) {
              setEditing(false);
              onMessage({ text: "回を変更しました", tone: "success" });
              router.refresh();
            }
            return r;
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-brand01 font-bold break-words">{session.title}</h3>
            <p className="text-brand04 text-xs">{session.heldOn ?? "日程未定"}</p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className={BUTTON_SECONDARY}>
            回を変更
          </button>
          <button type="button" onClick={() => setConfirming(true)} className={BUTTON_SECONDARY}>
            回を削除
          </button>
        </div>
      )}

      {confirming ? (
        <div className="bg-bg01 flex flex-wrap items-center gap-2 p-3">
          <p className="text-brand01 min-w-0 flex-1 text-sm">
            「{session.title}」と、その資料 {session.materials.length} 件をすべて削除します。元に戻せません。
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteSessionAction(session.id);
                if (r.error) onMessage({ text: r.error, tone: "error" });
                else {
                  onMessage({ text: "回を削除しました", tone: "success" });
                  router.refresh();
                }
              })
            }
            className="bg-brand03 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            削除する
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={BUTTON_SECONDARY}>
            やめる
          </button>
        </div>
      ) : null}

      <ul className="flex flex-col">
        {session.materials.map((m) => (
          <MaterialItem key={m.id} material={m} onMessage={onMessage} />
        ))}
        {session.materials.length === 0 ? <li className="text-brand04 text-sm">資料はまだありません。</li> : null}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id={`file-${session.id}`}
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
          className="sr-only"
          onChange={(e) => void upload(e.target.files)}
        />
        <label
          htmlFor={`file-${session.id}`}
          className={`${BUTTON_PRIMARY} cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}
        >
          {uploading ? "アップロード中…" : "資料を追加(PDF・画像)"}
        </label>
        <p className="text-brand04 text-xs">元のファイルをそのまま追加します。1つ {MATERIAL_MAX_MB}MB まで、まとめて選べます。</p>
      </div>
    </section>
  );
}

export function ManagePanel({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<Message>(null);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <section className="border-brand01/15 flex flex-col gap-3 border bg-white p-4">
        <h2 className="text-brand01 font-bold">回を追加</h2>
        <SessionForm
          initial={{ title: "", heldOn: "" }}
          submitLabel="追加"
          onSubmit={async (v) => {
            const r = await createSessionAction(v);
            if (!r.error) {
              setMessage({ text: "回を追加しました", tone: "success" });
              router.refresh();
            }
            return r;
          }}
        />
      </section>
      <MessageLine message={message} />
      {sessions.map((s) => (
        <SessionCard key={s.id} session={s} onMessage={setMessage} />
      ))}
    </div>
  );
}
