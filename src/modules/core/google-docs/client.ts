// Google ドキュメントへの書き込み(docs/DESIGN.md 43 章)。サーバー側専用。
// ポータルは Google の鍵を持たない。長井さんの Google アカウントで動く Apps Script(`docs/apps-script/google-docs-writer.gs`)を
// ウェブアプリとして公開し、そこへ合言葉つきで頼む。スクリプトができるのは、タブの一覧・タブの追加・タブの末尾への書き足しだけ。
// 設定(GOOGLE_DOCS_WRITER_URL・GOOGLE_DOCS_WRITER_SECRET)がなければ何もしない。失敗しても例外は投げず、ログに残す。

const TIMEOUT_MS = 30_000;

export type GoogleDocsWriterConfig = { url: string; secret: string };

export type DocTab = { tabId: string; title: string };

export function googleDocsWriterConfig(env: Record<string, string | undefined> = process.env): GoogleDocsWriterConfig | null {
  const url = env.GOOGLE_DOCS_WRITER_URL?.trim();
  const secret = env.GOOGLE_DOCS_WRITER_SECRET?.trim();
  if (!url || !secret || !url.startsWith("https://script.google.com/")) return null;
  return { url, secret };
}

type WriterResponse = { ok: boolean; error?: string; tabs?: DocTab[]; tabId?: string };

async function callWriter(config: GoogleDocsWriterConfig, body: Record<string, unknown>): Promise<WriterResponse> {
  // Apps Script のウェブアプリは、答えを別の URL への転送で返す(fetch が自動でたどる)。
  const res = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, secret: config.secret }),
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  let data: WriterResponse;
  try {
    data = JSON.parse(text) as WriterResponse;
  } catch {
    // 公開の設定(「全員」に公開していない など)がちがうと、Google のログイン画面の HTML が返る。
    throw new Error("書き込み役の答えが読めません(ウェブアプリの公開の設定を確認してください)");
  }
  if (!data.ok) throw new Error(data.error ?? "不明なエラー");
  return data;
}

/** ドキュメントのタブの一覧(子のタブも含めて、並び順)。 */
export async function listDocTabs(config: GoogleDocsWriterConfig, documentId: string): Promise<DocTab[]> {
  return (await callWriter(config, { action: "listTabs", documentId })).tabs ?? [];
}

/** ドキュメントの最後にタブを足し、文章を入れる。足したタブの ID を返す。 */
export async function addDocTab(config: GoogleDocsWriterConfig, documentId: string, title: string, text: string): Promise<string> {
  const { tabId } = await callWriter(config, { action: "addTab", documentId, title, text });
  if (!tabId) throw new Error("タブの ID が返りませんでした");
  return tabId;
}

/** タブの末尾に文章を書き足す。 */
export async function appendToDocTab(config: GoogleDocsWriterConfig, documentId: string, tabId: string, text: string): Promise<void> {
  await callWriter(config, { action: "appendToTab", documentId, tabId, text });
}
