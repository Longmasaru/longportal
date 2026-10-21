import { desc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { botsBots, botsRuns, type Bot, type BotRun } from "./schema";

// Bot の一覧(管理画面用)。docs/DESIGN.md 38 章。

export type BotWithRuns = Bot & { runs: Pick<BotRun, "runDate" | "status" | "message">[] };

/** すべての Bot と、それぞれの直近の実行(5 件まで)。 */
export async function listBotsWithRuns(): Promise<BotWithRuns[]> {
  const list = await db.select().from(botsBots).orderBy(botsBots.createdAt);
  if (list.length === 0) return [];
  const runs = await db
    .select({ botId: botsRuns.botId, runDate: botsRuns.runDate, status: botsRuns.status, message: botsRuns.message })
    .from(botsRuns)
    .where(inArray(botsRuns.botId, list.map((b) => b.id)))
    .orderBy(desc(botsRuns.runDate))
    .limit(list.length * 30);
  return list.map((bot) => ({
    ...bot,
    runs: runs.filter((r) => r.botId === bot.id).slice(0, 5).map(({ runDate, status, message }) => ({ runDate, status, message })),
  }));
}

