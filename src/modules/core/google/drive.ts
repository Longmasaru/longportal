import { createSign } from "node:crypto";

// Google ドライブの API(サーバー側専用)。ポータル専用のサービスアカウントの JSON 鍵で
// アクセストークンを取り、ドキュメントにコメントを付ける。鍵がなければ何もしない(本来の操作は止めない)。
// 鍵は GOOGLE_SERVICE_ACCOUNT_KEY。なければ、配達ルートが使う同じサービスアカウントの HAISOU_SHEETS_CREDENTIALS を使う
// (JSON をそのまま、または base64)。Google Cloud で Google Drive API を有効にしておく。
// 「リンクを知っている全員」に共有された文書は、ID が分かればサービスアカウントからも書き込める。

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SCOPE = "https://www.googleapis.com/auth/drive";
const TIMEOUT_MS = 10_000;
/** コメントの本文の上限(Google の上限より控えめ)。 */
const CONTENT_MAX = 4000;

export type GoogleServiceAccount = { clientEmail: string; privateKey: string };

export function googleServiceAccount(env: Record<string, string | undefined> = process.env): GoogleServiceAccount | null {
  const raw = (env.GOOGLE_SERVICE_ACCOUNT_KEY || env.HAISOU_SHEETS_CREDENTIALS)?.trim();
  if (!raw) return null;
  try {
    const key = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as { client_email?: string; private_key?: string };
    const clientEmail = key.client_email?.trim();
    const privateKey = key.private_key?.replace(/\\n/g, "\n").trim();
    return clientEmail && privateKey ? { clientEmail, privateKey } : null;
  } catch {
    return null;
  }
}

/** アクセストークンを取るための JWT(RS256)。 */
export function signGoogleAssertion(account: GoogleServiceAccount, nowSeconds: number): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: account.clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  return `${unsigned}.${signer.sign(account.privateKey).toString("base64url")}`;
}

let cached: { email: string; token: string; expiresAt: number } | null = null;

async function accessToken(account: GoogleServiceAccount): Promise<string> {
  const now = Date.now();
  if (cached && cached.email === account.clientEmail && cached.expiresAt > now + 60_000) return cached.token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signGoogleAssertion(account, Math.floor(now / 1000)),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google のトークンを取れませんでした(${res.status})`);
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Google のトークンが返りませんでした");
  cached = { email: account.clientEmail, token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

async function driveApi(account: GoogleServiceAccount, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken(account)}`, "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Google ドライブの呼び出しに失敗しました(${res.status}): ${detail}`);
  }
  return res;
}

/**
 * ドキュメントにコメントを付けて、コメントの ID を返す。鍵がなければ付けずに null。
 * quote は、コメントの上に「引用」として出る文(Google ドキュメントでは本文の位置には結び付かない)。
 */
export async function createDriveComment(fileId: string, content: string, quote?: string): Promise<string | null> {
  const account = googleServiceAccount();
  if (!account) return null;
  const body: Record<string, unknown> = { content: content.slice(0, CONTENT_MAX) };
  if (quote) body.quotedFileContent = { mimeType: "text/plain", value: quote.slice(0, 1000) };
  const res = await driveApi(account, `/files/${encodeURIComponent(fileId)}/comments?fields=id`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

/** ドキュメントのコメントの本文をすべて読む(取り込み直しで二重に付けないため。消したものは除く)。 */
export async function listDriveCommentContents(fileId: string): Promise<string[]> {
  const account = googleServiceAccount();
  if (!account) throw new Error("Google のサービスアカウントの鍵がありません。");
  const contents: string[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ fields: "nextPageToken,comments(content,deleted)", pageSize: "100" });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await driveApi(account, `/files/${encodeURIComponent(fileId)}/comments?${q}`);
    const data = (await res.json()) as { nextPageToken?: string; comments?: { content?: string; deleted?: boolean }[] };
    for (const c of data.comments ?? []) if (!c.deleted && c.content) contents.push(c.content);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return contents;
}
