import { Resend } from "resend";

// メールの送信(docs/DESIGN.md 26 章)。送り元は no-reply@long-ishikawa.com(DNS は Cloudflare)。
// 送信サービスは Resend(Vercel Marketplace でつないだもの。鍵は RESEND_API_KEY)。
// 鍵がないときは、開発環境だけ「送る内容を開発サーバーのログに出す」。本番で鍵がなければ、
// 送らずにエラーを記録する(画面には同じ案内を出すため、例外は投げない)。

export const MAIL_FROM = "LONG PORTAL <no-reply@long-ishikawa.com>";

export type MailMessage = { to: string; subject: string; text: string };

export type SendResult = { ok: true } | { ok: false; reason: string };

let client: Resend | null = null;

export async function sendMail(message: MailMessage): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[mail] 開発環境のため、送らずに内容を表示します\n宛先: ${message.to}\n件名: ${message.subject}\n${message.text}`,
      );
      return { ok: true };
    }
    console.error("[mail] メールの送信サービスが設定されていません(RESEND_API_KEY)。送りませんでした。");
    return { ok: false, reason: "not_configured" };
  }

  client ??= new Resend(key);
  try {
    const { error } = await client.emails.send({
      from: MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    if (error) {
      console.error(`[mail] 送信に失敗しました: ${error.name} ${error.message}`);
      return { ok: false, reason: error.name };
    }
    return { ok: true };
  } catch (err) {
    console.error("[mail] 送信に失敗しました(接続)", err);
    return { ok: false, reason: "network" };
  }
}

/**
 * メールに書くリンクの先頭(例: https://long-ishikawa.com)。
 * 本番は APP_URL(既定は本番のドメイン)だけを使い、リクエストのホスト名は信用しない
 * (ホスト名を書き換えた要求で、偽のサイトへのリンクを送らせないため)。
 */
export function appBaseUrl(): string {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "https://long-ishikawa.com" : "http://localhost:3000";
}
