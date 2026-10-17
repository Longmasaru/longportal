"use client";

import { useEffect, useRef, useState } from "react";

// 音声入力のボタン(Web Speech API。Chrome・Edge・iPhone の Safari)。人事管理の記録・教科書のツッコミで使う。
// 話した言葉を入力欄に足すだけで、保存は人が送信ボタンを押したときだけ。

const SMALL =
  "border-brand01/30 text-brand01 hover:border-brand03 hover:text-brand03 inline-flex items-center gap-1.5 border bg-white px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50";

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
export function DictationButton({ onText }: { onText: (text: string) => void }) {
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

