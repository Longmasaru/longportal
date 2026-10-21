import { createSign } from "node:crypto";

// LINE WORKS の Bot からトークルームへ知らせを送る(API 2.0。docs/DESIGN.md 35 章)。サーバー側専用。
// 認証はサービスアカウントの JWT(RS256)でアクセストークンを取り、Bot の API を呼ぶ。
// 鍵などは環境変数(LINEWORKS_*)に置く。未設定なら何もしない(通知は「あれば便利」なもので、本来の操作は止めない)。

const TOKEN_URL = "https://auth.worksmobile.com/oauth2/v2.0/token";
const API_BASE = "https://www.worksapis.com/v1.0";
const TIMEOUT_MS = 10_000;

export type LineWorksConfig = {
  clientId: string;
  clientSecret: string;
  serviceAccount: string;
  privateKey: string;
  botId: string;
};

export function lineWorksConfig(env: Record<string, string | undefined> = process.env): LineWorksConfig | null {
  const clientId = env.LINEWORKS_CLIENT_ID?.trim();
  const clientSecret = env.LINEWORKS_CLIENT_SECRET?.trim();
  const serviceAccount = env.LINEWORKS_SERVICE_ACCOUNT?.trim();
  // 1 行で保存された鍵(改行が \n の文字)も受け付ける。
  const privateKey = env.LINEWORKS_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const botId = env.LINEWORKS_BOT_ID?.trim();
  if (!clientId || !clientSecret || !serviceAccount || !privateKey || !botId) return null;
  return { clientId, clientSecret, serviceAccount, privateKey, botId };
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** アクセストークンを取るための JWT(RS256)。 */
export function signAssertion(config: LineWorksConfig, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iss: config.clientId, sub: config.serviceAccount, iat: nowSeconds, exp: nowSeconds + 3600 }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(config.privateKey).toString("base64url")}`;
}

// scope ごとに、期限まで使い回す(知らせは bot、準備のときの名簿の読み取りは user.read)。
const cached = new Map<string, { token: string; expiresAt: number }>();

async function accessToken(config: LineWorksConfig, scope = "bot"): Promise<string> {
  const now = Date.now();
  const hit = cached.get(scope);
  if (hit && hit.expiresAt > now + 60_000) return hit.token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      assertion: signAssertion(config, Math.floor(now / 1000)),
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`LINE WORKS のトークンを取れませんでした(${res.status})`);
  const data = (await res.json()) as { access_token?: string; expires_in?: string | number };
  if (!data.access_token) throw new Error("LINE WORKS のトークンが返りませんでした");
  cached.set(scope, { token: data.access_token, expiresAt: now + Number(data.expires_in ?? 3600) * 1000 });
  return data.access_token;
}

async function botApi(config: LineWorksConfig, path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${API_BASE}/bots/${encodeURIComponent(config.botId)}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(config)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`LINE WORKS の Bot の呼び出しに失敗しました(${res.status})`);
  return res;
}

/**
 * トークルーム(channel)に文字を送る。設定がなければ送らずに false。
 * 失敗しても例外は投げず、ログに残して false を返す(呼び出し元の操作は成功のままにする)。
 */
export async function sendLineWorksChannelText(channelId: string | undefined, text: string): Promise<boolean> {
  const config = lineWorksConfig();
  if (!config || !channelId) return false;
  try {
    await botApi(config, `/channels/${encodeURIComponent(channelId)}/messages`, {
      content: { type: "text", text: text.slice(0, 2000) },
    });
    return true;
  } catch (err) {
    console.error(`[lineworks] 送れませんでした: ${err instanceof Error ? err.message : "不明"}`);
    return false;
  }
}

/** Bot が入ったトークルームを作り、その channelId を返す(準備のとき、スクリプトから使う)。 */
export async function createLineWorksChannel(members: string[], title: string): Promise<string> {
  const config = lineWorksConfig();
  if (!config) throw new Error("LINEWORKS_* の環境変数が足りません。");
  const res = await botApi(config, "/channels", { members, title });
  const data = (await res.json()) as { channelId?: string };
  if (!data.channelId) throw new Error("channelId が返りませんでした。");
  return data.channelId;
}

export type LineWorksUser = { userId: string; email: string; lastName: string; firstName: string; orgUnitIds: string[] };

/** 会社の LINE WORKS の利用者の一覧(準備のとき、トークルームに入れる人の ID を名前から探すために使う。scope user.read)。 */
export async function listLineWorksUsers(): Promise<LineWorksUser[]> {
  const config = lineWorksConfig();
  if (!config) throw new Error("LINEWORKS_* の環境変数が足りません。");
  const token = await accessToken(config, "user.read");
  const users: LineWorksUser[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`${API_BASE}/users`);
    url.searchParams.set("count", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`LINE WORKS の利用者の一覧を取れませんでした(${res.status})`);
    const data = (await res.json()) as {
      users?: {
        userId?: string;
        email?: string;
        userName?: { lastName?: string; firstName?: string };
        organizations?: { orgUnits?: { orgUnitId?: string }[] }[];
      }[];
      responseMetaData?: { nextCursor?: string | null };
    };
    for (const u of data.users ?? []) {
      if (!u.userId) continue;
      users.push({
        userId: u.userId,
        email: u.email ?? "",
        lastName: u.userName?.lastName ?? "",
        firstName: u.userName?.firstName ?? "",
        orgUnitIds: (u.organizations ?? []).flatMap((o) => (o.orgUnits ?? []).flatMap((x) => (x.orgUnitId ? [x.orgUnitId] : []))),
      });
    }
    cursor = data.responseMetaData?.nextCursor ?? undefined;
  } while (cursor);
  return users;
}

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** 転送先にもトークを付けてよい住所か(LINE WORKS の住所だけ)。 */
export function isLineWorksHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)(worksmobile\.com|worksapis\.com)$/.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * 利用者のプロフィール写真(LINE WORKS のアイコン。scope user.read)。設定がない・写真がない・取れないときは null。
 * API は 302 で写真の住所を返すので、その住所から中身を取る(LINE WORKS の住所にだけトークンを付ける)。
 */
export async function fetchLineWorksUserPhoto(
  userId: string,
): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const config = lineWorksConfig();
  if (!config) return null;
  try {
    const token = await accessToken(config, "user.read");
    const auth = { Authorization: `Bearer ${token}` };
    const first = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/photo`, {
      headers: auth,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let res = first;
    if (first.status >= 300 && first.status < 400) {
      const location = first.headers.get("location");
      if (!location) return null;
      const target = new URL(location, API_BASE).toString();
      res = await fetch(target, {
        headers: isLineWorksHost(target) ? auth : {},
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    }
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const data = await res.arrayBuffer();
    if (data.byteLength === 0 || data.byteLength > PHOTO_MAX_BYTES) return null;
    return { data, contentType };
  } catch (err) {
    console.error(`[lineworks] 写真を取れませんでした: ${err instanceof Error ? err.message : "不明"}`);
    return null;
  }
}
