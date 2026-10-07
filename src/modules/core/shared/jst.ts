// 基準日・時刻はすべて JST(docs/DESIGN.md 4.2)。
const TIME_ZONE = "Asia/Tokyo";

/** 今日(JST)を `YYYY-MM-DD` で返す。SQL にはこの値をパラメータとして渡す。 */
export function todayJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

/** 現在の時(JST、0〜23)。 */
export function hourJst(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

/** 曜日(JST)を「木」の形式で返す。 */
export function weekdayJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TIME_ZONE,
    weekday: "short",
  }).format(now);
}
