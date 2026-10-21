"use client";

import { useActionState } from "react";
import { respondEventAction } from "../event-actions";
import { EVENT_RESPONSE_LABEL, EVENT_RESPONSES, type EventResponse } from "../constants";
import type { RespondState } from "../types";

/** 参加・不参加のボタン(いまの返事を強調する)。docs/DESIGN.md 38.2。 */
export function RespondButtons({ eventId, current, label }: { eventId: string; current: EventResponse | null; label: string }) {
  const [state, action, pending] = useActionState<RespondState, FormData>(respondEventAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={eventId} />
      {EVENT_RESPONSES.map((r) => {
        const active = current === r;
        return (
          <button
            key={r}
            type="submit"
            name="response"
            value={r}
            disabled={pending}
            aria-pressed={active}
            aria-label={`${label} に${EVENT_RESPONSE_LABEL[r]}`}
            className={`border px-3 py-1 text-sm font-bold transition-colors disabled:opacity-60 ${
              active
                ? r === "yes"
                  ? "border-brand01 bg-brand01 text-white"
                  : "border-brand04 bg-brand04 text-white"
                : "border-brand01 text-brand01 hover:border-brand03 hover:text-brand03 bg-white"
            }`}
          >
            {EVENT_RESPONSE_LABEL[r]}
          </button>
        );
      })}
      {state?.error ? (
        <span role="alert" className="text-brand03 text-xs font-bold">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
