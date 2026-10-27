"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { DictationButton } from "@/modules/core/shared/ui/dictation";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_CLASS, LABEL_CLASS } from "@/modules/core/shared/ui/form";
import { createPhotoUploadUrlAction, deleteEntryAction, draftAiAction, saveEntryAction } from "../actions";
import type { DraftSuggestion } from "../ai";
import {
  CHAPTER_LABEL,
  EFFECT_MAX,
  MEMO_MAX,
  MISSING_MESSAGE,
  PHOTO_MAX_PER_KIND,
  PLACE_MAX,
  TITLE_MAX,
  WHAT_MAX,
  ZUKAN_CHAPTERS,
  missingFields,
  type MissingField,
  type PhotoKind,
  type ZukanChapter,
} from "../constants";
import { manifest } from "../manifest";

// カイゼン図鑑の登録(docs/DESIGN.md 44 章)。撮るだけ(ビフォー → アフター → 名前と章 → 登録)を基本に、
// ひとことのメモから AI が下書きを作れる。アフターがまだなら「発見待ち」で保存し、あとで足して登録する。
// 写真は端末で縮めてから、R2 へ直接送る(目安箱と同じ方式)。

/** 写真の長い辺(px)と JPEG の画質。スマホの写真をそのまま送らず、見るのに十分な大きさに縮める。 */
const PHOTO_EDGE = 1600;
const PHOTO_QUALITY = 0.82;

type Photo = { id: string; preview: string; key: string | null; error: boolean; local: boolean };

export type DraftInitial = {
  id: string;
  title: string;
  chapter: ZukanChapter | null;
  what: string;
  effect: string;
  place: string;
  photos: { id: string; kind: PhotoKind; storageKey: string }[];
};

function shrink(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, PHOTO_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", PHOTO_QUALITY);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

function ErrorText({ show, children }: { show: boolean; children: string }) {
  if (!show) return null;
  return (
    <p role="alert" className="text-brand03 mt-1.5 text-sm font-bold">
      {children}
    </p>
  );
}

function Required() {
  return <span className="bg-brand03 ml-2 px-1 text-xs font-normal text-white">必須</span>;
}

function PhotoSlots({
  kind,
  photos,
  onAdd,
  onRemove,
  invalid,
}: {
  kind: PhotoKind;
  photos: Photo[];
  onAdd: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  invalid: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const label = kind === "before" ? "ビフォー" : "アフター";
  return (
    <div className={`flex flex-wrap gap-2 ${invalid ? "outline-brand03 outline-2 outline-offset-4" : ""}`}>
      {photos.map((p) => (
        <div key={p.id} className="bg-field relative aspect-[3/4] w-32 md:w-40">
          {/* eslint-disable-next-line @next/next/no-img-element -- 端末で縮めた写真(blob:)か、保存済みの写真の入口 */}
          <img src={p.preview} alt={`${label}の写真`} className={`size-full object-cover ${p.key ? "" : "opacity-50"}`} />
          {!p.key ? (
            <span className="text-brand01 absolute inset-x-0 bottom-0 bg-white/85 text-center text-xs font-bold">
              {p.error ? "送れませんでした" : "送信中…"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(p.id)}
            aria-label={`${label}の写真を外す`}
            className="bg-brand01 absolute top-1 right-1 size-7 text-sm leading-7 text-white"
          >
            ×
          </button>
        </div>
      ))}
      {photos.length < PHOTO_MAX_PER_KIND ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={
            "hover:border-brand03 hover:text-brand03 flex aspect-[3/4] w-32 flex-col items-center justify-center gap-1 border-2 border-dashed text-sm font-bold md:w-40 " +
            (kind === "before" ? "border-brand01/30 text-brand04" : "border-brand01/60 text-brand01")
          }
        >
          <span aria-hidden className="text-3xl leading-none">
            ＋
          </span>
          {photos.length === 0 ? `${label}を撮る` : "もう 1 枚"}
        </button>
      ) : null}
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => {
        onAdd(e.target.files);
        e.target.value = "";
      }} />
    </div>
  );
}

export function EntryForm({ draft }: { draft: DraftInitial | null }) {
  const router = useRouter();
  const initialPhotos = (kind: PhotoKind): Photo[] =>
    (draft?.photos ?? [])
      .filter((p) => p.kind === kind)
      .map((p) => ({ id: p.id, preview: `${manifest.route}/photos/${p.id}`, key: p.storageKey, error: false, local: false }));
  const [photos, setPhotos] = useState<Record<PhotoKind, Photo[]>>({ before: initialPhotos("before"), after: initialPhotos("after") });
  const [memo, setMemo] = useState("");
  const [title, setTitle] = useState(draft?.title ?? "");
  const [chapter, setChapter] = useState<ZukanChapter | null>(draft?.chapter ?? null);
  const [what, setWhat] = useState(draft?.what ?? "");
  const [effect, setEffect] = useState(draft?.effect ?? "");
  const [place, setPlace] = useState(draft?.place ?? "");
  const [suggestion, setSuggestion] = useState<DraftSuggestion | null>(null);
  const [aiError, setAiError] = useState("");
  const [tried, setTried] = useState<"publish" | "draft" | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [aiPending, startAi] = useTransition();

  const ready = (kind: PhotoKind) => photos[kind].filter((p) => p.key);
  const uploading = [...photos.before, ...photos.after].some((p) => !p.key && !p.error);
  const check = (mode: "publish" | "draft"): MissingField[] =>
    missingFields({ mode, beforeCount: ready("before").length, afterCount: ready("after").length, title, chapter });
  const missing = tried ? check(tried) : [];
  const show = (f: MissingField) => missing.includes(f);

  async function addPhotos(kind: PhotoKind, files: FileList | null) {
    if (!files?.length) return;
    const room = PHOTO_MAX_PER_KIND - photos[kind].length;
    for (const file of Array.from(files).slice(0, room)) {
      const id = crypto.randomUUID();
      let blob: Blob;
      try {
        blob = await shrink(file);
      } catch {
        setError("この写真は読み込めませんでした。別の写真をお試しください。");
        continue;
      }
      const preview = URL.createObjectURL(blob);
      setPhotos((prev) => ({ ...prev, [kind]: [...prev[kind], { id, preview, key: null, error: false, local: true }] }));
      try {
        const r = await createPhotoUploadUrlAction({ fileName: "photo.jpg", contentType: "image/jpeg", size: blob.size });
        if (!r.ok) throw new Error(r.error);
        const put = await fetch(r.url, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
        if (!put.ok) throw new Error("upload");
        setPhotos((prev) => ({ ...prev, [kind]: prev[kind].map((p) => (p.id === id ? { ...p, key: r.key } : p)) }));
      } catch {
        setPhotos((prev) => ({ ...prev, [kind]: prev[kind].map((p) => (p.id === id ? { ...p, error: true } : p)) }));
      }
    }
  }

  function removePhoto(kind: PhotoKind, id: string) {
    setPhotos((prev) => {
      const target = prev[kind].find((p) => p.id === id);
      if (target?.local) URL.revokeObjectURL(target.preview);
      return { ...prev, [kind]: prev[kind].filter((p) => p.id !== id) };
    });
  }

  function askAi() {
    setAiError("");
    setSuggestion(null);
    const keys = (["before", "after"] as const).flatMap((kind) => ready(kind).map((p) => ({ kind, key: p.key as string })));
    if (keys.length === 0) {
      setAiError("写真を 1 枚以上つけてから押してください。");
      return;
    }
    startAi(async () => {
      const r = await draftAiAction({ photos: keys, memo });
      if ("error" in r) setAiError(r.error);
      else setSuggestion(r.draft);
    });
  }

  function useSuggestion() {
    if (!suggestion) return;
    setTitle(suggestion.title);
    setChapter(suggestion.chapter);
    setWhat(suggestion.what);
    setEffect(suggestion.effect);
    setSuggestion(null);
  }

  function save(mode: "publish" | "draft") {
    setTried(mode);
    setError("");
    if (check(mode).length > 0) return;
    if (uploading) {
      setError("写真を送っています。少し待ってから、もう一度押してください。");
      return;
    }
    startTransition(async () => {
      const r = await saveEntryAction({
        mode,
        draftId: draft?.id ?? null,
        title,
        chapter,
        what,
        effect,
        place,
        before: ready("before").map((p) => p.key as string),
        after: ready("after").map((p) => p.key as string),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(r.published ? `${manifest.route}/${r.id}?new=1` : `${manifest.route}?view=mine`);
    });
  }

  function removeDraft() {
    if (!draft || !window.confirm("この発見待ちのページを消しますか?写真も消えます。")) return;
    startTransition(async () => {
      const r = await deleteEntryAction(draft.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`${manifest.route}?view=mine`);
    });
  }

  const choice = (selected: boolean) =>
    "border px-3 py-2 text-left text-sm transition-colors " +
    (selected ? "bg-brand01 border-brand01 text-white" : "border-brand01/20 text-brand01 hover:border-brand03 bg-white");

  return (
    <form onSubmit={(e) => { e.preventDefault(); save("publish"); }} noValidate className="flex flex-col gap-8">
      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <p className={LABEL_CLASS}>
            <span className="font-heading text-brand04 mr-2 tracking-widest">1</span>ビフォー(改善前)
            <Required />
          </p>
          <PhotoSlots kind="before" photos={photos.before} onAdd={(f) => void addPhotos("before", f)} onRemove={(id) => removePhoto("before", id)} invalid={show("before")} />
          <ErrorText show={show("before")}>ビフォーの写真を 1 枚以上つけてください。</ErrorText>
        </div>
        <div>
          <p className={LABEL_CLASS}>
            <span className="font-heading text-brand04 mr-2 tracking-widest">2</span>アフター(改善後)
            <Required />
          </p>
          <PhotoSlots kind="after" photos={photos.after} onAdd={(f) => void addPhotos("after", f)} onRemove={(id) => removePhoto("after", id)} invalid={show("after")} />
          <ErrorText show={show("after")}>アフターの写真を 1 枚以上つけてください。</ErrorText>
          <p className="text-brand04 mt-1.5 text-xs">まだ改善の途中なら、ビフォーだけ「発見待ち」で保存して、あとで足せます。</p>
        </div>
      </section>
      <p className="text-brand04 -mt-4 text-xs">写真がない改善(帳票や手順など)は、画面のスクリーンショットで登録できます。写真はそれぞれ {PHOTO_MAX_PER_KIND} 枚まで。</p>

      <section className="bg-bg01 flex flex-col gap-2 px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label htmlFor="zukan-memo" className="text-brand01 text-sm font-bold">
            <span className="font-heading text-brand04 mr-2 tracking-widest">3</span>ひとこと<span className="text-brand04 ml-2 text-xs font-normal">任意・話すだけで OK</span>
          </label>
          <DictationButton onText={(t) => setMemo((prev) => (prev ? `${prev}${t}` : t).slice(0, MEMO_MAX))} />
        </div>
        <textarea
          id="zukan-memo"
          rows={3}
          maxLength={MEMO_MAX}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="例: 工具がいつも見つからなかったので、壁に形を描いたボードを作って定位置を決めた。探す時間がなくなった。"
          className={`${FIELD_CLASS} resize-y bg-white`}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={askAi}
            disabled={aiPending}
            className="border-brand01/30 text-brand01 hover:border-brand03 hover:text-brand03 inline-flex items-center gap-1.5 border bg-white px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50"
          >
            <span aria-hidden>✨</span>
            {aiPending ? "写真を見ています…" : "AIで下書き"}
          </button>
          <span className="text-brand04 text-xs">写真とひとことから、名前・章・何をしたか・効果の案を作ります。</span>
        </div>
        {aiError ? (
          <p role="alert" className="text-brand03 text-sm font-bold">
            {aiError}
          </p>
        ) : null}
        {suggestion ? (
          <div className="border-brand01/20 flex flex-col gap-2 border bg-white p-3" aria-live="polite">
            <p className="text-brand01 text-xs font-bold tracking-widest">AI の案(まだ入っていません)</p>
            <dl className="text-ink grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-brand04">名前</dt>
              <dd className="font-bold">{suggestion.title}</dd>
              <dt className="text-brand04">章</dt>
              <dd>{CHAPTER_LABEL[suggestion.chapter].label}</dd>
              <dt className="text-brand04">何をしたか</dt>
              <dd className="whitespace-pre-wrap">{suggestion.what}</dd>
              <dt className="text-brand04">効果</dt>
              <dd className="whitespace-pre-wrap">{suggestion.effect}</dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={useSuggestion} className={BUTTON_PRIMARY}>
                この案を使う
              </button>
              <button type="button" onClick={() => setSuggestion(null)} className={BUTTON_SECONDARY}>
                使わない
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-6">
        <div>
          <label htmlFor="zukan-title" className={LABEL_CLASS}>
            <span className="font-heading text-brand04 mr-2 tracking-widest">4</span>名前
            <Required />
          </label>
          <input
            id="zukan-title"
            type="text"
            maxLength={TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 工具の定位置ボード"
            aria-invalid={show("title")}
            className={`${FIELD_CLASS} border-2 ${show("title") ? "border-brand03" : "border-transparent"}`}
          />
          <p className="text-brand04 mt-1 text-right text-xs tabular-nums">
            {title.length} / {TITLE_MAX}
          </p>
          <ErrorText show={show("title")}>図鑑に載せる名前を書いてください。</ErrorText>
        </div>

        <fieldset>
          <legend className={LABEL_CLASS}>
            章<Required />
          </legend>
          <div className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${show("chapter") ? "outline-brand03 outline-2 outline-offset-4" : ""}`}>
            {ZUKAN_CHAPTERS.map((c) => (
              <button key={c} type="button" aria-pressed={chapter === c} onClick={() => setChapter(c)} className={choice(chapter === c)}>
                <span className="block font-bold">{CHAPTER_LABEL[c].label}</span>
                {CHAPTER_LABEL[c].hint ? (
                  <span className={`block text-xs ${chapter === c ? "text-white/80" : "text-brand04"}`}>{CHAPTER_LABEL[c].hint}</span>
                ) : null}
              </button>
            ))}
          </div>
          <ErrorText show={show("chapter")}>章を 1 つ選んでください。</ErrorText>
        </fieldset>

        <div>
          <label htmlFor="zukan-what" className={LABEL_CLASS}>
            何をしたか<span className="text-brand04 ml-2 text-xs font-normal">任意</span>
          </label>
          <textarea id="zukan-what" rows={3} maxLength={WHAT_MAX} value={what} onChange={(e) => setWhat(e.target.value)} className={`${FIELD_CLASS} resize-y`} />
        </div>
        <div>
          <label htmlFor="zukan-effect" className={LABEL_CLASS}>
            効果<span className="text-brand04 ml-2 text-xs font-normal">任意</span>
          </label>
          <textarea
            id="zukan-effect"
            rows={2}
            maxLength={EFFECT_MAX}
            value={effect}
            onChange={(e) => setEffect(e.target.value)}
            placeholder="例: 探す時間が 1 日 10 分ほど減った"
            className={`${FIELD_CLASS} resize-y`}
          />
        </div>
        <div>
          <label htmlFor="zukan-place" className={LABEL_CLASS}>
            場所<span className="text-brand04 ml-2 text-xs font-normal">任意</span>
          </label>
          <input
            id="zukan-place"
            type="text"
            maxLength={PLACE_MAX}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="例: 本社工場 2 階の工具棚"
            className={FIELD_CLASS}
          />
        </div>
      </section>

      {missing.length > 0 ? (
        <div role="alert" className="border-brand03 bg-brand03/10 text-brand03 border-2 px-4 py-3 text-sm font-bold">
          まだ{tried === "draft" ? "保存" : "登録"}できません。次を確認してください。
          <ul className="mt-1 list-disc pl-5 font-normal">
            {missing.map((m) => (
              <li key={m}>{MISSING_MESSAGE[m]}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-brand03 text-sm font-bold">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <button type="submit" disabled={pending} className={`${BUTTON_PRIMARY} py-4 text-base`}>
          {pending ? "保存しています…" : "図鑑に登録する"}
        </button>
        <button type="button" disabled={pending} onClick={() => save("draft")} className={BUTTON_SECONDARY}>
          発見待ちで保存(アフターはあとで)
        </button>
        {draft ? (
          <button type="button" disabled={pending} onClick={removeDraft} className="text-brand04 hover:text-brand03 self-start text-sm font-bold">
            この発見待ちを消す
          </button>
        ) : null}
      </div>
    </form>
  );
}
