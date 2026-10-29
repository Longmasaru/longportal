// 別プロジェクトのアプリのうち、ポータルのログインを引き継ぐ(SSO)ものの契約。docs/DESIGN.md 28 章。
// アプリの URL・表示名・表示する相手は、管理画面(/admin/apps)で external として登録する。
// ここに書いた権限は npm run sync:manifests で DB に登録され、持っている人の通行証に載る。
import type { ExternalAppContract } from "@/modules/core/sso";

export const EXTERNAL_APP_CONTRACTS: readonly ExternalAppContract[] = [
  {
    // AI教室(リポジトリ ai-kyoshitsu)。社内AI講習会の資料を回ごとに開いて、全画面で映す。
    appKey: "aikyoshitsu",
    ssoSecretEnv: "SSO_SECRET_AIKYOSHITSU",
    // ポータルの住所の中(/aikyoshitsu/…)で、ポータルの画面に埋め込んで表示する。転送先は next.config.ts。
    embedPath: "/aikyoshitsu",
    permissions: [{ code: "aikyoshitsu.materials.manage", description: "AI教室: 回と資料の登録・変更・削除" }],
  },
  {
    // 注文書CSV変換(リポジトリ order-csv。開発は老川さん)。取引先の注文書を、基幹システム(will)に取り込む CSV に変換する。
    // 使える人(担当者)は、アプリ管理の Audience で決める。アプリの中の権限はまだない。
    appKey: "ordercsv",
    ssoSecretEnv: "SSO_SECRET_ORDERCSV",
    embedPath: "/order-csv",
    permissions: [],
  },
];
