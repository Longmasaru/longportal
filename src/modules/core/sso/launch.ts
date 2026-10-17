import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { canInAnyScope, requireActor } from "../access";
import { listAppsForActor } from "../apps";
import { buildPass, signPass, ssoEntryUrl, type ExternalAppContract } from "./pass";

/**
 * サイドバーのアプリを開く入口(/apps/launch/<app_key>)の行き先。docs/DESIGN.md 28 章。
 * - 使えないアプリ(無効・対象外・存在しない)は null(呼び出し側で 404)。
 * - SSO の契約がある別プロジェクトのアプリには、通行証をつけた入口の URL。契約がなければ、登録された URL をそのまま。
 */
export async function resolveLaunchUrl(appKey: string, contracts: readonly ExternalAppContract[]): Promise<string | null> {
  const actor = await requireActor();
  if (actor.mustChangePassword) redirect("/password");
  const app = (await listAppsForActor(actor)).find((a) => a.appKey === appKey);
  if (!app) return null;
  if (app.kind === "internal") return app.route;
  if (!app.url) return null;
  const contract = contracts.find((c) => c.appKey === appKey);
  if (!contract) return app.url;

  const secret = process.env[contract.ssoSecretEnv];
  if (!secret) throw new Error(`${contract.ssoSecretEnv} が設定されていません。`);
  const pass = buildPass({
    appKey,
    userId: actor.userId,
    name: actor.employee?.name ?? actor.loginId,
    perms: contract.permissions.map((p) => p.code).filter((code) => canInAnyScope(actor, code)),
    nowSeconds: Math.floor(Date.now() / 1000),
    jti: randomUUID(),
  });
  return ssoEntryUrl(app.url, signPass(pass, secret));
}
