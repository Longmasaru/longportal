// 元の Google スプレッドシート「取引先一覧表」を、Google Sheets API で直接読み書きする(docs/DESIGN.md 29 章)。
// ポータル専用のサービスアカウント(ロボット用のアカウント)で入り、シートはそのアカウントに「編集者」で共有してもらう。
// 鍵は環境変数 HAISOU_SHEETS_CREDENTIALS(サービスアカウントの JSON。そのまま、または base64。Vercel では Sensitive)、
// シートは HAISOU_SHEET_ID。どちらかが無ければ、シートは使わずにポータルの DB を使う(開発用)。
import { createSign } from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type Credentials = { client_email: string; private_key: string; token_uri?: string };

function readCredentials(): Credentials | null {
  const raw = process.env.HAISOU_SHEETS_CREDENTIALS?.trim();
  if (!raw) return null;
  const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const json = JSON.parse(text) as Partial<Credentials>;
  if (!json.client_email || !json.private_key) throw new Error("HAISOU_SHEETS_CREDENTIALS の形が正しくありません");
  return { client_email: json.client_email, private_key: json.private_key, token_uri: json.token_uri };
}

export function sheetId(): string | null {
  return process.env.HAISOU_SHEET_ID?.trim() || null;
}

/** シートを使う設定になっているか(鍵とシートの ID の両方がある)。 */
export function sheetConfigured(): boolean {
  return !!sheetId() && !!process.env.HAISOU_SHEETS_CREDENTIALS?.trim();
}

function apiBase(): string {
  // 確認用の差し替え(手元の偽のサーバー)。本番では使わない。
  return process.env.HAISOU_SHEETS_API_BASE?.trim() || "https://sheets.googleapis.com";
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const cred = readCredentials();
  if (!cred) throw new Error("HAISOU_SHEETS_CREDENTIALS が設定されていません");
  const tokenUrl = cred.token_uri || TOKEN_URL;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: cred.client_email,
    scope: SCOPE,
    aud: tokenUrl,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(cred.private_key, "base64url");
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`シートへの接続に失敗しました(認証 ${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function call<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | string[]> } = {}) {
  const id = sheetId();
  if (!id) throw new Error("HAISOU_SHEET_ID が設定されていません");
  const url = new URL(`${apiBase()}/v4/spreadsheets/${encodeURIComponent(id)}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    for (const one of Array.isArray(v) ? v : [v]) url.searchParams.append(k, one);
  }
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 403) throw new Error("シートを読み書きする許可がありません(シートの共有を確認してください)");
    throw new Error(`シートの読み書きに失敗しました(${res.status}) ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** `'シート名'!A1:I` の形にする。 */
export function a1(title: string, range: string): string {
  return `'${title.replace(/'/g, "''")}'!${range}`;
}

/** 表示どおりの文字列で読む(見た目と同じ値。日付・時刻は「2026/10/21」「9:00」など)。行の並びはシートのまま。 */
export async function readRanges(ranges: string[]): Promise<string[][][]> {
  const json = await call<{ valueRanges: { values?: unknown[][] }[] }>("/values:batchGet", {
    query: { ranges, valueRenderOption: "FORMATTED_VALUE", majorDimension: "ROWS" },
  });
  return json.valueRanges.map((vr) => (vr.values ?? []).map((row) => row.map((v) => (v == null ? "" : String(v)))));
}

/** 書き込み(人が入力したのと同じ扱い。日付・時刻・数は、シートでもその型になる)。 */
export async function writeRanges(data: { range: string; values: (string | number)[][] }[]): Promise<void> {
  await call("/values:batchUpdate", {
    method: "POST",
    body: { valueInputOption: "USER_ENTERED", data },
  });
}

/** 表の最後に行を足す。足した最初の行の番号(1 始まり)を返す。 */
export async function appendRows(range: string, values: (string | number)[][]): Promise<number> {
  const json = await call<{ updates?: { updatedRange?: string } }>(`/values/${encodeURIComponent(range)}:append`, {
    method: "POST",
    query: { valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS" },
    body: { values },
  });
  const m = json.updates?.updatedRange?.match(/![A-Z]+(\d+)/);
  return m ? Number(m[1]) : 0;
}

const sheetIdCache = new Map<string, number>();

async function tabId(title: string): Promise<number> {
  const hit = sheetIdCache.get(title);
  if (hit !== undefined) return hit;
  const json = await call<{ sheets: { properties: { sheetId: number; title: string } }[] }>("", {
    query: { fields: "sheets.properties(sheetId,title)" },
  });
  for (const s of json.sheets) sheetIdCache.set(s.properties.title, s.properties.sheetId);
  const id = sheetIdCache.get(title);
  if (id === undefined) throw new Error(`シート「${title}」が見つかりません`);
  return id;
}

/** 行を消す(rows は 1 始まりの行番号。下の行から消すので、番号はずれない)。 */
export async function deleteRows(title: string, rows: number[]): Promise<void> {
  if (!rows.length) return;
  const id = await tabId(title);
  const sorted = [...new Set(rows)].sort((a, b) => b - a);
  await call(":batchUpdate", {
    method: "POST",
    body: {
      requests: sorted.map((r) => ({
        deleteDimension: { range: { sheetId: id, dimension: "ROWS", startIndex: r - 1, endIndex: r } },
      })),
    },
  });
}

/** 文字として書く(先頭の 0 や「=」が消えたり、式・日付に化けたりしないように)。空はそのまま空。 */
export function asText(v: string): string {
  return v === "" ? "" : `'${v}`;
}
