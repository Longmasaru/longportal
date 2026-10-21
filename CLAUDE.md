# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@docs/HANDOFF.md

新しいアプリを作る・各サービス(GitHub / Neon / Vercel / Cloudflare)につなぐ・本番に出すときは、先に **`docs/playbooks/new-app-setup.md`** を読み、その手順に沿って進めること。

LONG PORTAL は株式会社ロングの社内ポータル基盤。設計の正は **`docs/DESIGN.md`**(確定版)。実装前に必ず読み、設計を変える場合は先に同ファイルを更新すること。

## コマンド

- `npm run dev` / `npm run build` / `npm run start`
- `npm run lint` — ESLint。module 境界(`no-restricted-imports`)もここで検査される
- `npm run typecheck` — `tsc --noEmit`
- `npm run sync:manifests` — コード側の定義(権限)を DB に反映。`npm run db:grant-admin -- <login_id>` — 管理者の復旧。`npm run db:import-employees -- <CSV> --actor <login_id> [--apply]` — 社員の一括取り込み(追加のみ。既定は確認だけ。CSV は個人情報なのでリポジトリの外に置く。docs/DESIGN.md 21 章)。`npm run db:issue-accounts -- --actor <login_id> --out <CSV> [--apply]` — アカウントの一括発行(ログイン ID = 社員番号。初期パスワードの配布用 CSV はリポジトリの外に書き出す)。`npm run db:import-birth-dates -- <CSV> --actor <login_id> [--apply] [--overwrite]` — 生年月日の一括登録(見出し `employee_number,birth_date`。CSV はリポジトリの外。docs/DESIGN.md 37 章)。`npm run db:import-kyokasho -- <docx|zip> --slug <名前> --actor <login_id> [--apply]` — ロングの教科書の取り込み(Google ドキュメントを Word で保存したもの。図形描画の図がある文書は「ウェブページ」で保存した zip。docs/DESIGN.md 30 章)
- `npm run db:generate` / `db:migrate` / `db:check` / `db:seed` — Drizzle。migration は `DATABASE_URL_UNPOOLED`(direct connection)で実行する。`DB_TARGET`(development / production)の明示が必須で、production への実行には `CONFIRM_PRODUCTION=yes` も要る。ローカルの `.env.local` は development ブランチの接続先にし、本番の接続文字列は置かない。手書き SQL が要る制約(EXCLUDE など)は `drizzle-kit generate --custom` で migration を作る
- `npm test` — ユニットテスト(`node:test` + `tsx`。アクセス判定の純粋関数など)

Node は 24.x、npm は 11.x に固定(`engines` + `.nvmrc` + `.npmrc` の `engine-strict`)。依存は `^` なしの完全固定。

## 設計上の守るべき規則(詳細は docs/DESIGN.md)

- 依存方向は `src/app → src/modules/apps/* → src/modules/core/*` の一方向。業務アプリ同士は直接依存しない。core は apps に依存しない。
- `src/app` は薄いルーティング層。業務ロジック・Server Actions・データアクセス・schema・components は各 module に置く。
- DB は PostgreSQL + Drizzle。`pgSchema` で module ごとに分離(`core.*` / `todo.*` ...)。主キーは UUID。スキーマ変更は正式 migration のみで、起動時の自動 DDL(`ensureSchema()` 等)は使わない。
- アクセス判定の本判定は Node Runtime 側の共通ヘルパー(`modules/core/access`)。Middleware(`proxy.ts`)はログイン済みかの粗い確認のみ。JWT には `userId` だけを載せる。deny by default。
- 基準日(「今日」)はすべて JST。`todayJst()` で求めて SQL にはパラメータで渡す。
- permission の code はコード(manifest)で定義して sync で DB に反映する。管理画面から作らない。
- `.env.local` などの実値はコミットしない。雛形は `.env.example`。
- Next.js 16.3.8 の仕様は `node_modules/next/dist/docs/` で確認すること(TODOSample の実装を思い込みで流用しない)。

## デザインシステム

`src/app/globals.css` はロングのデザインシステム(`docs/design-system-long-kanazawa.md`)のトークンと基本スタイルのみを持つ。ポータル画面ではコーポレートサイト用の流体ルートフォントを使わず、ルート 16px 固定(docs/DESIGN.md 15 章)。コンポーネント用のクラス(`.heading-01`、`.button-01` など)は、必要になった時点で TODOSample の `globals.css` から取り込む。画面は Tailwind のユーティリティとトークン(`text-brand01` など)で書く。
