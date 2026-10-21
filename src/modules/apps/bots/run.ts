import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sendLineWorksChannelText } from "@/modules/core/lineworks";
import { todayJst } from "@/modules/core/shared/jst";
import { BOT_KIND_DEFS, type Composed } from "./kinds";
import { fetchJmaForecast } from "./rain";
import { botsBots, botsRuns, type Bot, type BotRunStatus } from "./schema";

// Bot の実行(docs/DESIGN.md 40 章)。定時の実行(cron)と、画面の「試しに送る」から呼ぶ。サーバー側専用。

export type RunOutcome = { botId: string; name: string; status: Exclude<BotRunStatus, "running">; message: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "不明なエラー";
}

/** その Bot が今日送る本文を作る(送らない日はその理由)。 */
export async function composeBot(bot: Pick<Bot, "kind" | "settings">, today: string): Promise<Composed> {
  const def = BOT_KIND_DEFS[bot.kind];
  return def.compose(bot.settings, { today, fetchForecast: fetchJmaForecast });
}

async function runOne(bot: Bot, today: string): Promise<RunOutcome | null> {
  // 先に今日の行を入れる。入れられなかったら、今日はもう動いている(2 回送らない)。
  const [claimed] = await db
    .insert(botsRuns)
    .values({ botId: bot.id, runDate: today, status: "running" })
    .onConflictDoNothing()
    .returning({ id: botsRuns.id });
  if (!claimed) return null;

  let outcome: RunOutcome;
  try {
    const composed = await composeBot(bot, today);
    if (!composed.send) {
      outcome = { botId: bot.id, name: bot.name, status: "skipped", message: composed.reason };
    } else if (await sendLineWorksChannelText(bot.channelId, composed.text)) {
      outcome = { botId: bot.id, name: bot.name, status: "sent", message: composed.text };
    } else {
      outcome = { botId: bot.id, name: bot.name, status: "failed", message: "LINE WORKS に送れませんでした(鍵の設定かトークルームを確かめてください)。" };
    }
  } catch (err) {
    outcome = { botId: bot.id, name: bot.name, status: "failed", message: errorMessage(err) };
  }
  await db
    .update(botsRuns)
    .set({ status: outcome.status, message: outcome.message.slice(0, 2000) })
    .where(eq(botsRuns.id, claimed.id));
  return outcome;
}

/** 有効な Bot を、今日の分だけ 1 つずつ実行する(今日すでに動いた Bot は飛ばす)。 */
export async function runEnabledBots(now: Date = new Date()): Promise<RunOutcome[]> {
  const today = todayJst(now);
  const list = await db.select().from(botsBots).where(eq(botsBots.isEnabled, true));
  const outcomes: RunOutcome[] = [];
  for (const bot of list) {
    const outcome = await runOne(bot, today);
    if (outcome) outcomes.push(outcome);
  }
  return outcomes;
}

/** 「試しに送る」: 今日の本文を作って、頭に【試し】を付けてすぐ送る。送らない日の Bot も、理由を添えて送る。記録には残さない。 */
export async function sendTrial(botId: string): Promise<{ ok: boolean; message: string }> {
  const [bot] = await db.select().from(botsBots).where(eq(botsBots.id, botId));
  if (!bot) return { ok: false, message: "Bot が見つかりません。" };
  let composed: Composed;
  try {
    composed = await composeBot(bot, todayJst());
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
  const text = composed.send
    ? `【試し】${composed.text}`
    : `【試し】${bot.name}: 今日は送らない日です(${composed.reason})`;
  const ok = await sendLineWorksChannelText(bot.channelId, text);
  return ok
    ? { ok: true, message: "送りました。トークルームを確かめてください。" }
    : { ok: false, message: "LINE WORKS に送れませんでした。channelId と、LINEWORKS_* の鍵の設定を確かめてください。" };
}
