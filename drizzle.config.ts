import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { normalizeDatabaseUrl } from "./src/db/connection";

config({ path: ".env.local" });

// 本番 DB への誤実行を防ぐガード(migrate のときだけ検査する)。
// - DB_TARGET に development / production を必ず明示する。
// - production に流すときは CONFIRM_PRODUCTION=yes も必要。
// - 実行前に接続先ホストを表示する。
if (process.argv.includes("migrate")) {
  const target = process.env.DB_TARGET;
  if (target !== "development" && target !== "production") {
    throw new Error("DB_TARGET が未設定です。development か production を指定してください。");
  }
  if (target === "production" && process.env.CONFIRM_PRODUCTION !== "yes") {
    throw new Error("production への migration には CONFIRM_PRODUCTION=yes が必要です。");
  }
  const host = new URL(process.env.DATABASE_URL_UNPOOLED ?? "postgres://invalid").host;
  console.log(`[migrate] DB_TARGET=${target} host=${host}`);
}

// migration は direct connection(pooler なし)で実行する。
// 各 module の schema.ts(pgSchema 単位: core / todo / ...)を一元的に migration 管理する。
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/**/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: normalizeDatabaseUrl(process.env.DATABASE_URL_UNPOOLED ?? ""),
  },
  // 拡張(btree_gist 等)や他スキーマに影響しないよう、管理対象スキーマを明示する。
  // 新しい module の pgSchema を追加したらここにも追記する。
  schemaFilter: ["core", "todo", "calendar", "haisou", "kyokasho", "hr", "arigato", "nippo", "bots", "meyasubako", "nakama", "zukan"],
  strict: true,
  verbose: true,
});
