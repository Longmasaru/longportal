import { requireGlobalPermission } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { lineWorksConfig } from "@/modules/core/lineworks";
import { FormNotice, PageHeading, StatusTag } from "@/modules/core/shared/ui/form";
import { BOT_KIND_DEFS } from "../kinds";
import { MANAGE_PERMISSION, manifest } from "../manifest";
import { listBotsWithRuns } from "../queries";
import { BOT_KINDS, type BotRunStatus } from "../schema";
import { BotButtons } from "./bot-buttons";
import { BotForm } from "./bot-form";

const STATUS_LABEL: Record<BotRunStatus, string> = {
  running: "実行中",
  sent: "送った",
  skipped: "送らない日",
  failed: "失敗",
};

const STATUS_TONE: Record<BotRunStatus, "neutral" | "info" | "attention" | "muted"> = {
  running: "neutral",
  sent: "info",
  skipped: "muted",
  failed: "attention",
};

/** LINE WORKS の Bot の管理(bots.manage を全社で持つ人だけ。それ以外は 404)。docs/DESIGN.md 40 章。 */
export async function BotsPage() {
  await requireAppAccess(manifest.appKey);
  await requireGlobalPermission(MANAGE_PERMISSION);
  const bots = await listBotsWithRuns();
  const kinds = BOT_KINDS.map((value) => ({
    value,
    label: BOT_KIND_DEFS[value].label,
    description: BOT_KIND_DEFS[value].description,
    defaults: BOT_KIND_DEFS[value].defaults,
  }));
  const configured = lineWorksConfig() !== null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="LINE WORKS の Bot"
        description="毎朝 6 時ごろ、有効な Bot が LINE WORKS のトークルームに知らせを送ります。送るのは「LONG PORTAL」の Bot です。"
      />

      {configured ? null : (
        <FormNotice tone="warning">
          LINE WORKS の鍵(LINEWORKS_*)が設定されていないため、いまは送れません。Bot の作成と設定はできます。
        </FormNotice>
      )}

      <section className="border-brand01/15 flex flex-col gap-4 border bg-white p-4 md:p-6">
        <h2 className="text-brand01 font-bold">新しい Bot</h2>
        <BotForm kinds={kinds} />
      </section>

      {bots.length === 0 ? (
        <p className="text-brand04 bg-white p-6 text-sm">まだ Bot がありません。</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {bots.map((bot) => (
            <li key={bot.id} className="border-brand01/15 flex flex-col gap-4 border bg-white p-4 md:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-brand01 font-bold">{bot.name}</h2>
                <StatusTag tone="neutral">{BOT_KIND_DEFS[bot.kind].label}</StatusTag>
                {bot.isEnabled ? null : <StatusTag tone="muted">停止中</StatusTag>}
              </div>
              <BotForm
                bot={{
                  id: bot.id,
                  name: bot.name,
                  kind: bot.kind,
                  channelId: bot.channelId,
                  isEnabled: bot.isEnabled,
                  settings: bot.settings,
                }}
                kinds={kinds}
              />
              <BotButtons botId={bot.id} name={bot.name} />
              <div className="bg-bg01 flex flex-col gap-2 p-3">
                <h3 className="text-brand01 text-sm font-bold">最近の実行</h3>
                {bot.runs.length === 0 ? (
                  <p className="text-brand04 text-xs">まだ動いていません。</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {bot.runs.map((r) => (
                      <li key={r.runDate} className="text-brand01 flex flex-wrap items-start gap-2 text-xs">
                        <span className="tabular-nums">{r.runDate}</span>
                        <StatusTag tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusTag>
                        <span className="text-brand04 min-w-0 flex-1 break-words whitespace-pre-line">{r.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
