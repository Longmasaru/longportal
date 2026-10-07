// DB に書き込むスクリプトの共通ガード(本番への誤実行を防ぐ)。
// - DB_TARGET に development / production を必ず明示する。
// - production に流すときは CONFIRM_PRODUCTION=yes も必要。
// - 実行前に接続先ホストを表示する。
export function assertTarget(label: string): void {
  const target = process.env.DB_TARGET;
  if (target !== "development" && target !== "production") {
    throw new Error("DB_TARGET が未設定です。development か production を指定してください。");
  }
  if (target === "production" && process.env.CONFIRM_PRODUCTION !== "yes") {
    throw new Error(`production への ${label} には CONFIRM_PRODUCTION=yes が必要です。`);
  }
  const host = new URL(process.env.DATABASE_URL ?? "postgres://invalid").host;
  console.log(`[${label}] DB_TARGET=${target} host=${host}`);
}
