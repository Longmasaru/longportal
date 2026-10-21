import Link from "next/link";
import { resolveActor } from "@/modules/core/access";
import { canAccessApp } from "@/modules/core/apps";
import { manifest } from "../manifest";
import { listRequestNotices } from "../queries";
import { personLabel } from "../requests";
import { AcknowledgeButton } from "./acknowledge-button";
import { formatDue } from "./format";

/**
 * ホームの一番上に出す「○○さんから依頼が届きました」(docs/DESIGN.md 39.3)。
 * 確認するか、完了するか、お返しするまで出す。TODO アプリを使えない人・依頼がない人には何も描画しない。
 */
export async function TodoHomeNotice() {
  const result = await resolveActor();
  if (!result.ok || result.actor.mustChangePassword) return null;
  const actor = result.actor;
  if (!(await canAccessApp(actor, manifest.appKey))) return null;
  const notices = await listRequestNotices(actor.userId);
  if (notices.length === 0) return null;

  return (
    <section
      aria-label="TODO の依頼のお知らせ"
      className="mx-auto -mb-4 flex w-full max-w-6xl flex-col gap-2 px-4 pt-8 md:-mb-6 md:px-8 md:pt-10"
    >
      <ul className="flex flex-col gap-2">
        {notices.map((n) => (
          <li
            key={n.id}
            className="border-brand01 bg-bg01 flex flex-col gap-2 border border-l-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="flex items-start gap-3">
              <span className="bg-brand01 shrink-0 px-1.5 text-xs leading-5 font-bold text-white">依頼</span>
              <span className="text-brand01 font-bold [overflow-wrap:anywhere]">
                {personLabel(n.fromName)}から依頼が届きました: {n.text}
                {n.dueDate ? (
                  <span className="text-brand04 ml-2 text-sm font-medium">(期限 {formatDue(n.dueDate)})</span>
                ) : null}
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <AcknowledgeButton id={n.id} label={n.text} />
              <Link
                href={manifest.route}
                className="text-brand01 hover:text-brand03 text-sm font-bold transition-colors"
              >
                TODO を開く ›
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
