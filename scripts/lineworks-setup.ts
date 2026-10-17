// LINE WORKS の Bot の準備(docs/DESIGN.md 33 章): Bot が入ったトークルームを作り、試しに 1 通送って、channelId を表示する。
// 実行: npm run lineworks:setup -- --members <LINE WORKS の ID(メールアドレスの形)をカンマ区切り> --title <トークルームの名前>
// 表示された channelId を、Vercel の環境変数(例: KYOKASHO_LINEWORKS_CHANNEL_ID)に登録する。鍵は .env.local の LINEWORKS_*。
import { createLineWorksChannel, lineWorksConfig, sendLineWorksChannelText } from "../src/modules/core/lineworks";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  if (!lineWorksConfig()) {
    throw new Error("LINEWORKS_CLIENT_ID / CLIENT_SECRET / SERVICE_ACCOUNT / PRIVATE_KEY / BOT_ID を .env.local に入れてください。");
  }
  const members = (arg("members") ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  const title = arg("title") ?? "LONG PORTAL の知らせ";
  if (members.length === 0) throw new Error("--members に、トークルームに入れる人の LINE WORKS の ID を書いてください。");
  const channelId = await createLineWorksChannel(members, title);
  const sent = await sendLineWorksChannelText(channelId, `LONG PORTAL から「${title}」に知らせを送れるようになりました。`);
  console.log(`[lineworks] トークルームを作りました: channelId=${channelId}(試しの送信: ${sent ? "OK" : "失敗"})`);
}

main().catch((err) => {
  console.error(`[lineworks] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
