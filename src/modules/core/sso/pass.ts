import { createHmac } from "node:crypto";

// 別プロジェクトのアプリへ渡す「通行証」(DB に依存しない純粋な関数)。docs/DESIGN.md 28 章。
// 形式: `<本文 JSON の base64url>.<HMAC-SHA256 署名の base64url>`。アプリ側は同じ鍵で検証する。
// 60 秒だけ有効。1 回しか使えないこと(jti)の確認は、アプリ側が行う。

export const PASS_TTL_SECONDS = 60;
const MIN_SECRET_LENGTH = 32;

/** SSO でつなぐ別プロジェクトのアプリの契約(コード側で定義する。modules/apps/external-apps.ts)。 */
export type ExternalAppContract = {
  appKey: string;
  /** 通行証の署名の鍵を入れる環境変数の名前(アプリ側にも同じ値を置く)。 */
  ssoSecretEnv: string;
  /** そのアプリの権限。sync:manifests で DB に登録し、持っているものを通行証に載せる。 */
  permissions: readonly { code: string; description: string }[];
};

export type Pass = {
  v: 1;
  typ: "pass";
  app: string;
  /** core.users の ID */
  sub: string;
  name: string;
  perms: string[];
  iat: number;
  exp: number;
  jti: string;
};

export function buildPass(input: {
  appKey: string;
  userId: string;
  name: string;
  perms: string[];
  nowSeconds: number;
  jti: string;
}): Pass {
  return {
    v: 1,
    typ: "pass",
    app: input.appKey,
    sub: input.userId,
    name: input.name.slice(0, 100),
    perms: input.perms,
    iat: input.nowSeconds,
    exp: input.nowSeconds + PASS_TTL_SECONDS,
    jti: input.jti,
  };
}

export function signPass(pass: Pass, secret: string): string {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error(`通行証の鍵は ${MIN_SECRET_LENGTH} 文字以上にしてください。`);
  const body = Buffer.from(JSON.stringify(pass)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** アプリの URL に、通行証を受け取る入口(/sso)をつなげる。 */
export function ssoEntryUrl(appUrl: string, token: string): string {
  const base = appUrl.endsWith("/") ? appUrl : `${appUrl}/`;
  const url = new URL("sso", base);
  url.searchParams.set("token", token);
  return url.toString();
}
