// ありがとうカードの選択肢と、週の計算(docs/DESIGN.md 34 章)。
// DB に依存しないので、クライアントからも読める。

/** 「どんなこと」。人事ポリシー「育てて、育つ。」の言葉に合わせた 4 つ。 */
export const ARIGATO_TAGS = ["taught", "helped", "challenged", "systemized"] as const;
export type ArigatoTag = (typeof ARIGATO_TAGS)[number];

export const ARIGATO_TAG_LABEL: Record<ArigatoTag, string> = {
  taught: "教えてくれた",
  helped: "助けてくれた",
  challenged: "挑戦していた",
  systemized: "仕組みにしてくれた",
};

/** 公開範囲。public = アプリを使える全員、private = 送った人と受け取った人だけ。 */
export const ARIGATO_VISIBILITIES = ["public", "private"] as const;
export type ArigatoVisibility = (typeof ARIGATO_VISIBILITIES)[number];

/** もらった人が、カードに 1 つだけ付けられる返事のスタンプ(docs/DESIGN.md 34 章)。 */
export const ARIGATO_REPLIES = ["glad", "likewise", "welcome", "anytime"] as const;
export type ArigatoReply = (typeof ARIGATO_REPLIES)[number];
export const ARIGATO_REPLY_LABEL: Record<ArigatoReply, string> = {
  glad: "うれしい!",
  likewise: "こちらこそ",
  welcome: "どういたしまして",
  anytime: "またいつでも",
};

export const MESSAGE_MAX_LENGTH = 140;
/** 1 人が 1 日(JST)に送れる枚数(連投の防止)。 */
export const DAILY_SEND_LIMIT = 20;
/** 「みんな」に出す枚数。 */
export const FEED_LIMIT = 50;

/** `YYYY-MM-DD` に日数を足す(暦日の計算。時差の影響を受けないよう UTC で扱う)。 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** その日を含む週(月曜はじまり)の月曜と日曜。 */
export function weekRange(date: string): { start: string; end: string } {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = 日曜
  const start = addDays(date, -((day + 6) % 7));
  return { start, end: addDays(start, 6) };
}

/** その日を含む月の初日と末日。`month` は `YYYY-MM`。 */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

/** `YYYY-MM` の月から n か月ずらした月。 */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** もらった点: 同じ人からは 1 か月にこの点数まで(送り合いで稼げないように)。 */
export const RECEIVED_PER_SENDER_MONTH = 4;

/**
 * もらった点(docs/DESIGN.md 34 章)。送り主ごとの「カードをもらった日数」(同じ人からは 1 日 1 点)を、
 * 1 人あたり月 RECEIVED_PER_SENDER_MONTH 点までで足す(raw)。評価に入るのは、自分が伝えた点と同じ数まで(counted)。
 */
export function receivedPoints(daysBySender: number[], given: number): { raw: number; counted: number } {
  const raw = daysBySender.reduce((sum, d) => sum + Math.min(d, RECEIVED_PER_SENDER_MONTH), 0);
  return { raw, counted: Math.min(raw, given) };
}
