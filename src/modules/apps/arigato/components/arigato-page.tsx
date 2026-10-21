import Link from "next/link";
import { canGlobally } from "@/modules/core/access";
import { canAccessApp, requireAppAccess } from "@/modules/core/apps";
import { manifest } from "../manifest";
import { getMonthPoints, getWeekStatus, listFeed, listReceived, listRecipients } from "../queries";
import { ArigatoBoard } from "./arigato-board";
import { BanzukeSummary } from "./banzuke-summary";

/** ありがとうカードの入口。アプリ管理で有効にし、表示する相手に当てはまる人だけ(それ以外は 404)。 */
export async function ArigatoPage() {
  const actor = await requireAppAccess(manifest.appKey);
  const [recipients, feed, received, week, canSeeSodatsu, myPoints] = await Promise.all([
    listRecipients(actor.userId, actor.today),
    listFeed(actor.userId),
    listReceived(actor.userId),
    getWeekStatus(actor.userId, actor.today),
    canAccessApp(actor, "sodatsu"),
    getMonthPoints(actor.userId, actor.today.slice(0, 7)),
  ]);
  const canViewStats = canGlobally(actor, "arigato.stats.view");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-col gap-2">
        <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">THANKS CARD</p>
        <h1 className="text-brand01 text-2xl font-black md:text-3xl">ありがとうカード</h1>
        <p className="text-brand01 text-sm">
          「育てて、育つ。」を、毎日の言葉に。教えてくれた人、助けてくれた人に、一言で伝えましょう。
        </p>
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {canSeeSodatsu ? (
            <Link href="/apps/sodatsu" className="text-brand01 hover:text-brand03 font-bold underline-offset-4 hover:underline">
              「育てて、育つ。」を読む
            </Link>
          ) : null}
          {canViewStats ? (
            <Link href="/apps/arigato/stats" className="text-brand01 hover:text-brand03 font-bold underline-offset-4 hover:underline">
              集計を見る
            </Link>
          ) : null}
        </p>
      </header>
      <BanzukeSummary userId={actor.userId} today={actor.today} />
      <ArigatoBoard
        viewerId={actor.userId}
        canManage={canGlobally(actor, "arigato.cards.manage")}
        recipients={recipients}
        initialFeed={feed}
        initialReceived={received}
        initialWeek={week}
        initialMyPoints={myPoints.points}
        receivedRaw={myPoints.receivedRaw}
      />
    </div>
  );
}
