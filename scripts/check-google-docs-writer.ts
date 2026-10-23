// Google ドキュメントの書き込み役(Apps Script)の接続確認(docs/DESIGN.md 43 章)。
// 指定したドキュメントのタブを一覧し、--write を付けたときだけ、試験のタブを 1 つ足して 1 行書き足す。
// 本物の日報のドキュメントには --write を付けないこと(試験用のドキュメントで確かめる)。
//
// 実行: npm run gdocs:check -- <ドキュメントの ID か URL> [--write]
// 使う環境変数: GOOGLE_DOCS_WRITER_URL・GOOGLE_DOCS_WRITER_SECRET(.env.local)
import { addDocTab, appendToDocTab, googleDocsWriterConfig, listDocTabs } from "../src/modules/core/google-docs";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const target = argv.find((a) => !a.startsWith("--"));
  if (!target) throw new Error("使い方: npm run gdocs:check -- <ドキュメントの ID か URL> [--write]");
  const documentId = /\/document\/d\/([\w-]+)/.exec(target)?.[1] ?? target.trim();
  const config = googleDocsWriterConfig();
  if (!config) throw new Error("GOOGLE_DOCS_WRITER_URL(https://script.google.com/…)と GOOGLE_DOCS_WRITER_SECRET を設定してください。");

  const tabs = await listDocTabs(config, documentId);
  console.log(`[gdocs] タブ: ${tabs.length} 個(最初: ${tabs[0]?.title ?? "-"} / 最後: ${tabs.at(-1)?.title ?? "-"})`);
  if (!argv.includes("--write")) {
    console.log("[gdocs] 読み取りだけで終了しました。試験のタブを足すには --write を付けてください。");
    return;
  }
  const stamp = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const tabId = await addDocTab(config, documentId, `試験 ${stamp}`, `【試験】ポータルからタブを足しました(${stamp})\n8. 指導者からのフィードバック`);
  await appendToDocTab(config, documentId, tabId, "【試験】ポータルから書き足しました。");
  console.log(`[gdocs] 試験のタブを足し、1 行書き足しました(タブ「試験 ${stamp}」)。ドキュメントで確かめてください。`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
