"use client";

import { useEffect, useState } from "react";
import { CHECK_ITEMS, TODAY_ACTIONS } from "../content";

// 書いた内容とふりかえりの回答は、この端末のブラウザにだけ保存する(サーバーには送らない)。
// 現場では端末を共用することがあるので、保存のキーにはログイン中のユーザー ID を含める。

const SCALE = ["そう思わない", "あまり", "どちらとも", "やや", "そう思う"];

type Saved = { notes: Record<string, string>; checks: Record<string, number> };

function load(key: string): Saved {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>;
      return { notes: parsed.notes ?? {}, checks: parsed.checks ?? {} };
    }
  } catch {
    // 保存できない環境(プライベートモードなど)では、保存せずに使う。
  }
  return { notes: {}, checks: {} };
}

function resultMessage(checks: Record<string, number>): string | null {
  const values = CHECK_ITEMS.map((c) => checks[c.id]);
  if (values.some((v) => v === undefined)) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg >= 4.3) return "しっかり届いています。「今日からできること」を、今週ひとつ実行してみてください。";
  if (avg >= 3) return "だいぶ見えてきています。「疑問への答え」から、気になるものを一つ開いてみてください。";
  return "まだしっくりこなくて大丈夫です。違和感や疑問は、そのまま上司や役員に聞いてください。それも取り組みを良くする声です。";
}

export function TodayActions({ userId }: { userId: string }) {
  const storageKey = `sodatsu:${userId}`;
  const [saved, setSaved] = useState<Saved>({ notes: {}, checks: {} });

  useEffect(() => {
    // 保存済みの内容は、ブラウザでの表示後に読み込む(サーバーの描画と食い違わないように)。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(load(storageKey));
  }, [storageKey]);

  function update(next: Saved) {
    setSaved(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // 保存できなくても、画面上の入力はそのまま使える。
    }
  }

  const message = resultMessage(saved.checks);

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-5">
        {TODAY_ACTIONS.map((action, i) => (
          <label key={action.id} htmlFor={`sodatsu-${action.id}`} className="flex flex-col gap-2">
            <span className="text-brand01 font-bold">
              <span className="text-brand03 mr-2">{i + 1}</span>
              {action.text}
            </span>
            <textarea
              id={`sodatsu-${action.id}`}
              rows={2}
              value={saved.notes[action.id] ?? ""}
              placeholder={action.placeholder}
              onChange={(e) => update({ ...saved, notes: { ...saved.notes, [action.id]: e.target.value } })}
              className="bg-field text-brand01 placeholder:text-brand04/60 w-full resize-y px-3 py-2"
            />
          </label>
        ))}
        <p className="text-brand04 text-xs">
          書いた内容は、この端末のブラウザの中にだけ保存されます。会社や他の人には送られません。
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <h3 className="text-brand01 text-lg font-bold">いま、どう感じていますか</h3>
        {CHECK_ITEMS.map((item) => (
          <fieldset key={item.id} className="flex flex-col gap-2">
            <legend className="text-brand01 mb-2 font-medium">{item.text}</legend>
            <div className="grid grid-cols-5 gap-1.5">
              {SCALE.map((label, i) => {
                const value = i + 1;
                const checked = saved.checks[item.id] === value;
                return (
                  <label key={label} className="relative flex">
                    <input
                      type="radio"
                      id={`sodatsu-${item.id}-${value}`}
                      name={`sodatsu-${item.id}`}
                      value={value}
                      checked={checked}
                      onChange={() => update({ ...saved, checks: { ...saved.checks, [item.id]: value } })}
                      className="peer absolute inset-0 opacity-0"
                    />
                    <span
                      className={
                        "peer-focus-visible:outline-brand01 flex w-full cursor-pointer items-center justify-center border px-1 py-2 text-center text-xs leading-snug peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 " +
                        (checked
                          ? "bg-brand01 border-brand01 font-bold text-white"
                          : "border-brand01/20 text-brand01 hover:border-brand03")
                      }
                    >
                      {label}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        {message ? <p className="bg-bg01 text-brand01 p-4 font-medium">{message}</p> : null}
      </div>
    </div>
  );
}
