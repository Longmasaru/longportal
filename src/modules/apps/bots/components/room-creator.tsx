"use client";

import { useState, useTransition } from "react";
import { BUTTON_SECONDARY, FIELD_CLASS, Field, FormNotice, LABEL_CLASS } from "@/modules/core/shared/ui/form";
import { createRoomAction } from "../actions";
import { ROOM_TITLE_MAX, type RoomCandidate } from "../rooms";

/**
 * 送り先の部屋を画面から作る(docs/DESIGN.md 40 章)。Bot のフォームの中に置くため、form は使わず、
 * 入力には name を付けない(Bot の保存に混ざらない)。作れたら channelId を onCreated で渡す。
 */
export function RoomCreator({
  p,
  candidates,
  defaultTitle,
  onCreated,
}: {
  p: string;
  candidates: RoomCandidate[];
  defaultTitle: string;
  onCreated: (channelId: string) => void;
}) {
  // 名前を自分で入れるまでは、Bot の名前をそのまま使う。
  const [titleInput, setTitle] = useState<string | null>(null);
  const title = titleInput ?? defaultTitle;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [result, setResult] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const q = filter.trim();
  const shown = candidates.filter((c) =>
    q === "" ? true : `${c.name}${c.kana}${c.employeeNumber}${c.department}`.includes(q),
  );
  const departments = [...new Set(candidates.map((c) => c.department).filter(Boolean))];
  const nameById = new Map(candidates.map((c) => [c.id, c.name]));

  const toggle = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const create = () => {
    const name = title.trim() || "(名前なし)";
    if (!window.confirm(`選んだ ${selected.size} 人の LINE WORKS に部屋「${name}」ができ、あいさつが 1 通届きます。作りますか?`)) return;
    setResult(null);
    startTransition(async () => {
      const r = await createRoomAction({ title, employeeIds: [...selected] });
      if (r.ok) {
        setResult({ tone: "success", text: r.message });
        setSelected(new Set());
        onCreated(r.channelId);
      } else {
        setResult({ tone: "error", text: r.error });
      }
    });
  };

  return (
    <details className="bg-bg01 p-3">
      <summary className="text-brand01 cursor-pointer text-sm font-bold">部屋を新しく作る(LINE WORKS の操作は要りません)</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-brand04 text-xs">
          「LONG PORTAL」Bot の入ったトークルームを作り、その channelId を上の欄に入れます。自分も入るなら、自分も選んでください。
        </p>
        {result ? <FormNotice tone={result.tone}>{result.text}</FormNotice> : null}
        <Field label="部屋の名前" htmlFor={`${p}-room-title`} required>
          <input
            id={`${p}-room-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={ROOM_TITLE_MAX}
            className={FIELD_CLASS}
          />
        </Field>
        <div>
          <p className={LABEL_CLASS}>
            入れる人
            <span className="text-brand04 ml-2 font-normal">{selected.size}名を選択中</span>
          </p>
          {selected.size > 0 ? (
            <p className="text-brand01 mb-2 text-sm [overflow-wrap:anywhere]">
              {[...selected].map((id) => nameById.get(id) ?? "").join("、")}
            </p>
          ) : null}
          {departments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {departments.map((d) => {
                const ids = candidates.filter((c) => c.department === d).map((c) => c.id);
                const all = ids.every((id) => selected.has(id));
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggle(ids, !all)}
                    aria-pressed={all}
                    className={`border px-2 py-1 text-xs ${all ? "bg-brand01 border-brand01 text-white" : "border-brand01/30 text-brand01 bg-white"}`}
                  >
                    {d}({ids.length})
                  </button>
                );
              })}
            </div>
          ) : null}
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="氏名・フリガナ・社員番号・部署で絞り込み"
            aria-label="部屋に入れる社員を絞り込み"
            className={`${FIELD_CLASS} mb-2`}
          />
          <ul className="border-brand01/20 max-h-64 overflow-y-auto border bg-white">
            {shown.map((c) => (
              <li key={c.id} className="border-brand04/30 border-b last:border-b-0">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={(ev) => toggle([c.id], ev.target.checked)}
                    className="accent-brand01 size-4"
                  />
                  <span className="text-brand01 font-bold">{c.name}</span>
                  <span className="text-brand04 ml-auto text-xs">{c.department}</span>
                </label>
              </li>
            ))}
            {shown.length === 0 ? <li className="text-brand04 px-3 py-4 text-center text-sm">該当する社員がいません。</li> : null}
          </ul>
        </div>
        <div>
          <button type="button" onClick={create} disabled={pending || selected.size === 0} className={BUTTON_SECONDARY}>
            {pending ? "作っています…" : "この人たちで部屋を作る"}
          </button>
        </div>
      </div>
    </details>
  );
}
