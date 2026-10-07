import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { normalizeDatabaseUrl } from "./connection";
import * as schema from "./schema";

declare global {
  var _longPortalPgPool: Pool | undefined;
}

// アプリ実行時は pooled connection(DATABASE_URL)を使う。
// 開発時の HMR でリロードのたびにプールが増えないよう global にキャッシュする。
export const pool =
  globalThis._longPortalPgPool ??
  new Pool({ connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL ?? "") });

if (process.env.NODE_ENV !== "production") {
  globalThis._longPortalPgPool = pool;
}

export const db = drizzle(pool, { schema });
