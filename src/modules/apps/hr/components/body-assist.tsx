"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/modules/core/shared/ui/form";
import { polishRecordBodyAction } from "../actions";
import { POLISH_MIN } from "../labels";

// 記録の「内容」の欄の補助(docs/DESIGN.md 31.3)。音声入力と「AIで整える」。
// どちらも入力欄の文字を変えるだけで、保存は人が「記録を追加」「保存」を押したときだけ。

const SMALL = "border-brand01/30 text-brand01 hover:border-brand03 hover:text-brand03 inline-flex items-center gap-1.5 border bg-white px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50";

// Web Speech API(Chrome・Edge)。TypeScript の標準の型にないため、使う分だけ書く。
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MIC_ERROR: Record<string, string> = {
  "not-allowed": "マイクの使用が許可されていません。アドレス欄の左のマークから、マイクを許可してください。",
  "service-not-allowed": "マイクの使用が許可されていません。アドレス欄の左のマークから、マイクを許可してください。",
  "audio-capture": "マイクが見つかりません。",
  network: "音声認識につながりませんでした。",
};

/** 話した言葉を、確定するたびに onText で渡す。使えないブラウザでは何も出さない。 */
function DictationButton({ onText }: { onText: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => {
    // サーバーの描画と合わせるため、ブラウザで調べてから出す
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(recognitionCtor() !== null);
    return () => ref.current?.stop();
  }, []);

  if (!supported) return null;

  function start() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onTextRef.current(r[0].transcript);
        else pending += r[0].transcript;
      }
      setInterim(pending);
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setError(MIC_ERROR[e.error] ?? "音声入力が止まりました。");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      ref.current = null;
    };
    ref.current = rec;
    setError(null);
    rec.start();
    setListening(true);
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => (listening ? ref.current?.stop() : start())}
        aria-pressed={listening}
        className={listening ? "bg-brand03 border-brand03 inline-flex items-center gap-1.5 border px-3 py-1.5 text-sm font-bold text-white" : SMALL}
      >
        <span aria-hidden>{listening ? "■" : "🎤"}</span>
        {listening ? "止める" : "音声入力"}
      </button>
      {listening ? (
        <p className="text-brand04 text-xs" aria-live="polite">
          聞き取り中… {interim}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-brand03 text-xs font-bold">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** 内容の欄の下に出す、音声入力と「AIで整える」。 */
export function BodyAssist({
  employeeId,
  kind,
  body,
  onChange,
}: {
  employeeId: string;
  kind: string;
  body: string;
  onChange: (body: string) => void;
}) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef(body);
  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  function append(text: string) {
    const next = `${bodyRef.current}${text}`;
    bodyRef.current = next;
    onChange(next);
  }

  function polish() {
    setError(null);
    setSuggestion(null);
    startTransition(async () => {
      const result = await polishRecordBodyAction({ employeeId, kind, body });
      if ("error" in result) setError(result.error);
      else setSuggestion(result.text);
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-2">
        <DictationButton onText={append} />
        <button type="button" onClick={polish} disabled={pending || body.trim().length < POLISH_MIN} className={SMALL}>
          <span aria-hidden>✨</span>
          {pending ? "整えています…" : "AIで整える"}
        </button>
        {previous !== null && suggestion === null ? (
          <button
            type="button"
            onClick={() => {
              onChange(previous);
              setPrevious(null);
            }}
            className="text-brand04 hover:text-brand03 px-1 py-1.5 text-sm font-bold transition-colors"
          >
            元に戻す
          </button>
        ) : null}
      </div>
      <p className="text-brand04 text-xs">
        「AIで整える」は、この欄の文章だけを AI に送り(本人の氏名は「本人」に置き換えます)、読みやすくした案を出します。保存はされません。
      </p>
      {error ? (
        <p role="alert" className="text-brand03 text-sm font-bold">
          {error}
        </p>
      ) : null}
      {suggestion !== null ? (
        <div className="border-brand01/20 bg-brand01/5 flex flex-col gap-3 border p-3" aria-live="polite">
          <p className="text-brand01 text-xs font-bold tracking-widest">AI の案(まだ入力欄には入っていません)</p>
          <p className="text-brand01 text-sm leading-relaxed whitespace-pre-wrap">{suggestion}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPrevious(body);
                onChange(suggestion);
                setSuggestion(null);
              }}
              className={BUTTON_PRIMARY}
            >
              この案を使う
            </button>
            <button type="button" onClick={() => setSuggestion(null)} className={BUTTON_SECONDARY}>
              使わない
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
