// ログインの失敗回数の制限(純粋な規則。DB に依存しない)。
// 総当たり(ID・パスワードの試行)対策。docs/DESIGN.md の「ログイン強化」参照。
//
// - 同じログイン ID の失敗が WINDOW 内に LOGIN_FAILURE_LIMIT 回に達したら、WINDOW の間ロックする
//   (ロック中は、正しいパスワードでも照合しない)。存在しない ID も同じ扱いなので、ID の有無は推測できない。
// - 同じ接続元の失敗が WINDOW 内に IP_FAILURE_LIMIT 回に達したら、その接続元からの試行を止める。
//   会社の同じ出口(NAT)から全員がつなぐ場合を考え、ID ごとの上限よりずっと高くしている。

/** 失敗を数える時間の幅(分)。ロックの長さも同じ。 */
export const LOGIN_WINDOW_MINUTES = 15;
export const LOGIN_FAILURE_LIMIT = 5;
export const IP_FAILURE_LIMIT = 50;

/** ログイン ID・パスワードの入力の最大長(これを超える入力は、照合せずに拒否する)。 */
export const MAX_LOGIN_ID_LENGTH = 50;
export const MAX_LOGIN_PASSWORD_LENGTH = 200;

export type FailureCounts = {
  /** 同じ ID の、直近の失敗(最後の成功より後)の回数 */
  loginFailures: number;
  /** 同じ接続元の、直近の失敗の回数(接続元が分からないときは 0) */
  ipFailures: number;
};

export function isThrottled(counts: FailureCounts): boolean {
  return counts.loginFailures >= LOGIN_FAILURE_LIMIT || counts.ipFailures >= IP_FAILURE_LIMIT;
}

/**
 * リクエストの接続元を取り出す。Vercel は x-real-ip / x-forwarded-for を、実際の接続元で上書きして付ける。
 * 取れなければ null(その場合は ID ごとの制限だけが働く)。
 */
export function clientIpFrom(headers: { get(name: string): string | null } | undefined): string | null {
  if (!headers) return null;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ? forwarded.slice(0, 64) : null;
}
