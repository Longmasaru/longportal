"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { DictationButton } from "@/modules/core/shared/ui/dictation";
import { BUTTON_PRIMARY, FIELD_CLASS, LABEL_CLASS } from "@/modules/core/shared/ui/form";
import { createPhotoUploadUrlAction, createPostAction } from "../actions";
import {
  BODY_MAX,
  CATEGORY_LABEL,
  DESTINATION_LABEL,
  MEYASUBAKO_CATEGORIES,
  MEYASUBAKO_DESTINATIONS,
  MEYASUBAKO_VISIBILITIES,
  MISSING_MESSAGE,
  PHOTO_MAX_COUNT,
  PLACE_MAX,
  VISIBILITY_LABEL,
  missingFields,
  type MeyasubakoCategory,
  type MeyasubakoDestination,
  type MeyasubakoVisibility,
  type MissingField,
} from "../constants";

// 目安箱の投稿フォーム(docs/DESIGN.md 42 章)。カテゴリと公開範囲は初期値を置かず、必ず選ばせる(押し間違いの防止)。
// 足りない項目は、送ろうとしたときに赤字で理由を出す。写真は端末で縮めてから、R2 へ直接送る。

const DRAFT_KEY = "meyasubako-draft";
/** 写真の長い辺(px)と JPEG の画質。スマホの写真をそのまま送らず、見るのに十分な大きさに縮める。 */
const PHOTO_EDGE = 1600;
const PHOTO_QUALITY = 0.82;

type Photo = { id: string; preview: string; key: string | null; error: boolean };

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

function ErrorText({ id, show, children }: { id: string; show: boolean; children: string }) {
  if (!show) return null;
  return (
    <p id={id} role="alert" className="text-brand03 mt-1.5 text-sm font-bold">
      {children}
    </p>
  );
}

export function PostForm() {
  const router = useRouter();
  const [category, setCategory] = useState<MeyasubakoCategory | null>(null);
  const [visibility, setVisibility] = useState<MeyasubakoVisibility | null>(null);
  const [destination, setDestination] = useState<MeyasubakoDestination>("company");
  const [anonymous, setAnonymous] = useState(false);
  const [body, setBody] = useState("");
  const [place, setPlace] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const restored = useRef(false);

  // 書きかけ(本文・場所だけ)を、この端末に残す。選択肢は残さない(毎回選んでもらう)。
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as { body?: string; place?: string } | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved?.body) setBody(saved.body);
      if (saved?.place) setPlace(saved.place);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (body || place) localStorage.setItem(DRAFT_KEY, JSON.stringify({ body, place }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }, [body, place]);

  const uploading = photos.some((p) => !p.key && !p.error);
  const readyPhotos = photos.filter((p) => p.key);
  const missing: MissingField[] = missingFields({ category, visibility, body, photoCount: readyPhotos.length });
  const show = (f: MissingField) => tried && missing.includes(f);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = PHOTO_MAX_COUNT - photos.length;
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
      setPhotos((prev) => [...prev, { id, preview, key: null, error: false }]);
      try {
        const r = await createPhotoUploadUrlAction({ fileName: "photo.jpg", contentType: "image/jpeg", size: blob.size });
        if (!r.ok) throw new Error(r.error);
        const put = await fetch(r.url, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
        if (!put.ok) throw new Error("upload");
        setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, key: r.key } : p)));
      } catch {
        setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, error: true } : p)));
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError("");
    if (missing.length > 0) {
      document.getElementById(`meyasubako-field-${missing[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (uploading) {
      setError("写真を送っています。少し待ってから、もう一度押してください。");
      return;
    }
    startTransition(async () => {
      const r = await createPostAction({
        category,
        destination,
        visibility,
        anonymous,
        place,
        body,
        photoKeys: readyPhotos.map((p) => p.key as string),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      router.push(`/apps/meyasubako/${r.id}?sent=1`);
    });
  }

  const choice = (selected: boolean) =>
    "border px-3 py-2 text-left text-sm transition-colors " +
    (selected ? "bg-brand01 border-brand01 text-white" : "border-brand01/20 text-brand01 hover:border-brand03 bg-white");
  const groupOutline = (bad: boolean) => (bad ? "outline-brand03 outline-2 outline-offset-4" : "");

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-7">
      <fieldset id="meyasubako-field-category" aria-describedby="meyasubako-error-category">
        <legend className={LABEL_CLASS}>
          何についてですか?
          <span className="bg-brand03 ml-2 px-1 text-xs font-normal text-white">必須</span>
        </legend>
        <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${groupOutline(show("category"))}`}>
          {MEYASUBAKO_CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={choice(category === c)}>
              <span className="block font-bold">{CATEGORY_LABEL[c].label}</span>
              {CATEGORY_LABEL[c].hint ? (
                <span className={`block text-xs ${category === c ? "text-white/80" : "text-brand04"}`}>{CATEGORY_LABEL[c].hint}</span>
              ) : null}
            </button>
          ))}
        </div>
        <ErrorText id="meyasubako-error-category" show={show("category")}>
          カテゴリを1つ選んでください。
        </ErrorText>
      </fieldset>

      <div id="meyasubako-field-content">
        <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
          <label htmlFor="meyasubako-body" className="text-brand01 block text-sm font-bold">
            内容
            <span className="bg-brand03 ml-2 px-1 text-xs font-normal text-white">必須</span>
          </label>
          <DictationButton onText={(t) => setBody((prev) => (prev ? `${prev}${t}` : t).slice(0, BODY_MAX))} />
        </div>
        <textarea
          id="meyasubako-body"
          rows={6}
          maxLength={BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="例: 第2倉庫の入口、雨の日に床が濡れて滑りやすいです。マットがあると助かります。"
          aria-invalid={show("content")}
          aria-describedby="meyasubako-error-content"
          className={`${FIELD_CLASS} resize-y border-2 ${show("content") ? "border-brand03" : "border-transparent"}`}
        />
        <p className="text-brand04 mt-1 flex justify-between gap-2 text-xs">
          <span>音声入力が出ないときは、スマホのキーボードのマイクで話して入力できます。</span>
          <span className="tabular-nums">
            {body.length} / {BODY_MAX}
          </span>
        </p>
        <ErrorText id="meyasubako-error-content" show={show("content")}>
          内容を書くか、写真を1枚以上つけてください。
        </ErrorText>
      </div>

      <div>
        <p className={LABEL_CLASS}>
          写真<span className="text-brand04 ml-2 text-xs font-normal">任意・{PHOTO_MAX_COUNT}枚まで。その場で撮影もできます</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.id} className="bg-field relative size-24">
              {/* eslint-disable-next-line @next/next/no-img-element -- 端末で縮めた写真のプレビュー(blob:) */}
              <img src={p.preview} alt="添付する写真" className={`size-full object-cover ${p.key ? "" : "opacity-50"}`} />
              {!p.key ? (
                <span className="text-brand01 absolute inset-x-0 bottom-0 bg-white/85 text-center text-xs font-bold">
                  {p.error ? "送れませんでした" : "送信中…"}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => removePhoto(p.id)}
                aria-label="写真を外す"
                className="bg-brand01 absolute top-1 right-1 size-7 text-sm leading-7 text-white"
              >
                ×
              </button>
            </div>
          ))}
          {photos.length < PHOTO_MAX_COUNT ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="border-brand01/30 text-brand04 hover:border-brand03 hover:text-brand03 flex size-24 flex-col items-center justify-center gap-1 border-2 border-dashed text-xs font-bold"
            >
              <span aria-hidden className="text-2xl leading-none">
                ＋
              </span>
              写真を追加
            </button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void addPhotos(e.target.files)}
        />
      </div>

      <div>
        <label htmlFor="meyasubako-place" className={LABEL_CLASS}>
          場所<span className="text-brand04 ml-2 text-xs font-normal">任意</span>
        </label>
        <input
          id="meyasubako-place"
          type="text"
          maxLength={PLACE_MAX}
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="例: 第2倉庫の入口、2階の休憩室"
          className={FIELD_CLASS}
        />
      </div>

      <fieldset>
        <legend className={LABEL_CLASS}>宛先</legend>
        <div className="flex flex-wrap gap-2">
          {MEYASUBAKO_DESTINATIONS.map((d) => (
            <button key={d} type="button" aria-pressed={destination === d} onClick={() => setDestination(d)} className={choice(destination === d)}>
              {DESTINATION_LABEL[d]}
            </button>
          ))}
        </div>
        <p className="text-brand04 mt-1 text-xs">
          「会社宛て」が基本です。「リーダー宛て」は、あなたの部署・拠点のリーダーにも届きます。どちらも管理者が確認します。
        </p>
      </fieldset>

      <fieldset id="meyasubako-field-visibility" aria-describedby="meyasubako-error-visibility">
        <legend className={LABEL_CLASS}>
          ほかの社員に見えてもいいですか?
          <span className="bg-brand03 ml-2 px-1 text-xs font-normal text-white">必須</span>
        </legend>
        <div className={`grid gap-2 sm:grid-cols-2 ${groupOutline(show("visibility"))}`}>
          {MEYASUBAKO_VISIBILITIES.map((v) => (
            <button key={v} type="button" aria-pressed={visibility === v} onClick={() => setVisibility(v)} className={choice(visibility === v)}>
              <span className="block font-bold">{VISIBILITY_LABEL[v].label}</span>
              <span className={`block text-xs ${visibility === v ? "text-white/80" : "text-brand04"}`}>{VISIBILITY_LABEL[v].hint}</span>
            </button>
          ))}
        </div>
        <ErrorText id="meyasubako-error-visibility" show={show("visibility")}>
          「みんなに見えてOK」か「管理者だけに送る」のどちらかを選んでください。
        </ErrorText>
      </fieldset>

      <label className="text-brand01 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="accent-brand01 mt-1" />
        <span>
          名前を出さずに送る
          <span className="text-brand04 block text-xs">ほかの社員にも、管理者の画面にも、名前を出しません。返事は「わたしの投稿」に届きます。</span>
        </span>
      </label>

      {tried && missing.length > 0 ? (
        <div role="alert" className="border-brand03 bg-brand03/10 text-brand03 border-2 px-4 py-3 text-sm font-bold">
          まだ送れません。次を確認してください。
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

      <button type="submit" disabled={pending} className={`${BUTTON_PRIMARY} py-4 text-base`}>
        {pending ? "送っています…" : "目安箱に入れる"}
      </button>
    </form>
  );
}
