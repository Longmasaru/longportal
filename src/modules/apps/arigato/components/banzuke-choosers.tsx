"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chooseKojoAction, chooseShikonaAction } from "../actions";
import { KOJO_WORDS } from "../banzuke";
import styles from "./banzuke.module.css";

/** 四股名を候補から選ぶ。 */
export function ShikonaChooser({ candidates, current, taken }: { candidates: string[]; current: string | null; taken: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const choose = (name: string) =>
    start(async () => {
      setError(null);
      const r = await chooseShikonaAction(name);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  return (
    <>
      <div className={styles.choices} role="group" aria-label="四股名の候補">
        {candidates.map((name) => (
          <button
            key={name}
            type="button"
            className={styles.brush}
            aria-pressed={name === current}
            disabled={pending || (taken.includes(name) && name !== current)}
            onClick={() => choose(name)}
            title={taken.includes(name) ? "ほかの人が使っています" : undefined}
          >
            {name}
          </button>
        ))}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** 伝達式: 口上に入れる四字熟語を選ぶ(1 回だけ)。 */
export function KojoChooser() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const choose = (word: string) =>
    start(async () => {
      setError(null);
      const r = await chooseKojoAction(word);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  return (
    <>
      <div className={styles.yoji}>
        {KOJO_WORDS.map((w) => (
          <button key={w.word} type="button" disabled={pending} onClick={() => choose(w.word)}>
            <span className={styles.brush}>{w.word}</span>
            <small>{w.reading}</small>
          </button>
        ))}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
