// 別プロジェクトのアプリのうち、ポータルのログインを引き継ぐ(SSO)ものの契約。docs/DESIGN.md 28 章。
// アプリの URL・表示名・表示する相手は、管理画面(/admin/apps)で external として登録する。
// ここに書いた権限は npm run sync:manifests で DB に登録され、持っている人の通行証に載る。
import type { ExternalAppContract } from "@/modules/core/sso";

export const EXTERNAL_APP_CONTRACTS: readonly ExternalAppContract[] = [
  {
    // AI教室(リポジトリ ai-kyoshitsu)。社内AI講習会の資料を回ごとに開いて、全画面で映す。
    appKey: "aikyoshitsu",
    ssoSecretEnv: "SSO_SECRET_AIKYOSHITSU",
    permissions: [{ code: "aikyoshitsu.materials.manage", description: "AI教室: 回と資料の登録・変更・削除" }],
  },
];
