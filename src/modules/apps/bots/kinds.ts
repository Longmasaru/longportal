import { z } from "zod";
import { RAIN_AREAS, rainReport } from "./rain";
import type { BotKind } from "./schema";

// Bot の種類(docs/DESIGN.md 38 章)。種類ごとに「設定の形」と「その日に何を送るか」を持つ。
// 新しい種類は、ここに 1 つ足す(schema.ts の BOT_KINDS と、DB の check 制約にも足す)。
// DB や LINE WORKS には触れない(天気の取得は ctx から受け取る)ので、テストで確かめられる。

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export type ComposeContext = {
  /** 今日(JST の暦日 `YYYY-MM-DD`)。 */
  today: string;
  fetchForecast: (office: string) => Promise<unknown>;
};

/** 送るなら本文、送らないならその理由。 */
export type Composed = { send: true; text: string } | { send: false; reason: string };

/** 曜日(0 = 日曜)。today は JST の暦日なので、UTC の 0 時として数えればよい。 */
export function weekdayOf(today: string): number {
  return new Date(`${today}T00:00:00Z`).getUTCDay();
}

function dateLabel(today: string): string {
  const [, m, d] = today.split("-");
  return `${Number(m)}/${Number(d)}(${WEEKDAY_LABELS[weekdayOf(today)]})`;
}

const rainSettings = z.object({
  area: z.enum(RAIN_AREAS.map((a) => a.code) as [string, ...string[]], "地域を選んでください。"),
  threshold: z.coerce.number().int().min(10, "しきい値は 10〜100% にしてください。").max(100, "しきい値は 10〜100% にしてください。"),
  sendWhenDry: z.boolean(),
});
export type RainSettings = z.infer<typeof rainSettings>;

const noticeSettings = z.object({
  text: z.string().trim().min(1, "送る文を入力してください。").max(1000, "送る文は1000文字以内にしてください。"),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "送る曜日を 1 つ以上選んでください。"),
});
export type NoticeSettings = z.infer<typeof noticeSettings>;

export function composeRain(s: RainSettings, data: unknown, today: string): Composed {
  const report = rainReport(data, s.area, today);
  if (!report) return { send: false, reason: "気象庁の予報に、今日の降水確率がありませんでした。" };
  const where = report.areaName || "選んだ地域";
  const slots = report.slots.map((x) => `${x.hour}時〜 ${x.pop}%`).join(" / ");
  const rainy = report.maxPop >= s.threshold;
  if (!rainy && !s.sendWhenDry) {
    return { send: false, reason: `降水確率が最大 ${report.maxPop}% で、しきい値(${s.threshold}%)より低い。` };
  }
  const head = rainy
    ? `☔ 今日 ${dateLabel(today)} の${where}は、雨の予報です(降水確率 最大 ${report.maxPop}%)。`
    : `☀ 今日 ${dateLabel(today)} の${where}は、雨の心配は少なそうです(降水確率 最大 ${report.maxPop}%)。`;
  const lines = [head];
  if (report.weather) lines.push(`天気: ${report.weather}`);
  lines.push(`降水確率: ${slots}`);
  if (rainy) lines.push("傘をお忘れなく。");
  lines.push("(出典: 気象庁)");
  return { send: true, text: lines.join("\n") };
}

export function composeNotice(s: NoticeSettings, today: string): Composed {
  if (!s.weekdays.includes(weekdayOf(today))) return { send: false, reason: "送る曜日ではない。" };
  return { send: true, text: s.text };
}

type KindDef = {
  label: string;
  description: string;
  defaults: Record<string, unknown>;
  schema: z.ZodType<Record<string, unknown>>;
  /** 画面のフォームから設定を読む(項目名は `s.<名前>`)。 */
  fromForm: (formData: FormData) => unknown;
  compose: (settings: Record<string, unknown>, ctx: ComposeContext) => Promise<Composed>;
};

/** 保存された設定を確かめる。合わなければ、画面で直せる言葉でエラーにする。 */
function parseSettings<T>(schema: z.ZodType<T>, settings: unknown): T {
  const r = schema.safeParse(settings);
  if (!r.success) throw new Error(`Bot の設定を確かめてください(${r.error.issues[0]?.message ?? "形が違います"})。`);
  return r.data;
}

const str = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

export const BOT_KIND_DEFS: Record<BotKind, KindDef> = {
  rain: {
    label: "雨予報",
    description: "毎朝、気象庁の予報で今日の降水確率を見て、しきい値以上なら知らせます。",
    defaults: { area: "170010", threshold: 50, sendWhenDry: false } satisfies RainSettings,
    schema: rainSettings,
    fromForm: (f) => ({ area: str(f, "s.area"), threshold: str(f, "s.threshold"), sendWhenDry: f.get("s.sendWhenDry") === "on" }),
    compose: async (settings, ctx) => {
      const s = parseSettings(rainSettings, settings);
      const office = RAIN_AREAS.find((a) => a.code === s.area)?.office ?? "170000";
      return composeRain(s, await ctx.fetchForecast(office), ctx.today);
    },
  },
  notice: {
    label: "定時のお知らせ",
    description: "選んだ曜日の朝に、決めた文を送ります。",
    defaults: { text: "", weekdays: [1, 2, 3, 4, 5] } satisfies NoticeSettings,
    schema: noticeSettings,
    fromForm: (f) => ({ text: str(f, "s.text"), weekdays: f.getAll("s.weekdays").filter((v) => typeof v === "string") }),
    compose: async (settings, ctx) => composeNotice(parseSettings(noticeSettings, settings), ctx.today),
  },
};
