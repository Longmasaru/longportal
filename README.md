# LONG PORTAL

株式会社ロングの社内ポータル基盤。今後多数の社内業務アプリを追加していくための共通基盤として、モジュラーモノリスで構築する。

- 設計: [docs/DESIGN.md](docs/DESIGN.md)(確定版。実装の正)
- デザインシステム: [docs/design-system-long-kanazawa.md](docs/design-system-long-kanazawa.md)

## 技術基盤

Next.js 16.3.8 / React 19 / TypeScript / Tailwind v4 / PostgreSQL(Neon)/ Drizzle ORM / Auth.js(手順2で導入)/ Vercel

## セットアップ

前提: Node.js 24.x、npm 11.x(`.nvmrc` 参照)

```bash
npm install
cp .env.example .env.local   # DATABASE_URL などを設定
npm run dev                  # http://localhost:3000
```

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` / `npm run start` | 本番ビルド / 起動 |
| `npm run lint` | ESLint(module 境界の検査を含む) |
| `npm run typecheck` | 型チェック |
| `npm run db:generate` | Drizzle の migration を生成 |
| `npm run db:migrate` | migration を実行(`DATABASE_URL_UNPOOLED` を使用) |
| `npm run db:check` | migration の整合性チェック |
| `npm run db:seed` | 初期データ(雇用区分・初期管理者)を冪等に投入(`.env.local` の接続先) |
| `npm test` | ユニットテスト(node:test + tsx) |

## ディレクトリ

```
src/
  app/            薄いルーティング層
  modules/
    core/         認証・社員・権限・Audience・app registry など共通基盤
    apps/         各業務アプリ(todo, education, ...)
  db/             Drizzle クライアントと migration
scripts/          seed / manifest sync など
docs/             設計ドキュメント
```

依存方向は `src/app → modules/apps/* → modules/core/*` の一方向。詳細は設計ドキュメントを参照。

## 開発状況

実装順序(docs/DESIGN.md 12 章)の **手順 0(開発基盤)・手順 1(core スキーマ)・手順 2(認証: ログイン・パスワード変更・在籍状態の毎回判定)まで完了**。各管理画面・権限・Audience などは未実装(ホームのお知らせ・アプリ・社内リンクはモックデータ)。
