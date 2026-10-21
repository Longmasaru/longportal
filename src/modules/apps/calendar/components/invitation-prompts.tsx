import { shortDate } from "../logic";
import type { PendingInvitation } from "../types";
import { RespondButtons } from "./respond-buttons";

/** 参加の返事のお願い(カレンダーの画面とホームの一番上)。0 件なら何も描画しない。docs/DESIGN.md 38.2。 */
export function InvitationPrompts({ items }: { items: PendingInvitation[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label="参加の返事のお願い">
      {items.map((inv) => {
        const label = `${shortDate(inv.date)}${inv.time ? ` ${inv.time}` : ""} ${inv.title}`;
        return (
          <li
            key={inv.id}
            className="border-brand03 bg-brand03/10 flex flex-col gap-2 border border-l-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="flex items-start gap-3">
              <span className="bg-brand03 shrink-0 px-1.5 text-xs leading-5 font-bold text-white">返事</span>
              <span className="text-brand01 font-bold [overflow-wrap:anywhere]">{label} への参加の返事をしてください</span>
            </p>
            <RespondButtons eventId={inv.id} current={null} label={label} />
          </li>
        );
      })}
    </ul>
  );
}
