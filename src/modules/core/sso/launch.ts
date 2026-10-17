import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { canInAnyScope, requireActor } from "../access";
import { listAppsForActor } from "../apps";
import { buildPass, signPass, ssoEntryPath, ssoEntryUrl, type ExternalAppContract } from "./pass";

/**
 * サイドバーのアプリを開く入口(/apps/launch/<app_key>)の行き先。docs/DESIGN.md 28 章。
 * - 使えないアプリ(無効・対象外・存在しない)は null(呼び出し側で 404)。
 * - SSO の契約がある別プロジェクトのアプリには、通行証をつけた入口の URL(ポータルの中で表示するものは相対の住所)。
 *   契約がなければ、登録された URL をそのまま。
 */
/**
 * ポータルの中の、別プロジェクトのアプリのページ(/apps/<app_key>)の中身。
 * - ポータルの住所の中で表示するアプリ(embedPath あり)は、画面に埋め込む(入口は /apps/launch)。
 * - それ以外は、入口へ移動する。使えないアプリは null(呼び出し側で 404)。
 */
export async function resolveExternalAppPage(
  appKey: string,
  contracts: readonly ExternalAppContract[],
): Promise<{ mode: "embed"; title: string; src: string } | { mode: "redirect"; url: string } | null> {
  const actor = await requireActor();
  if (actor.mustChangePassword) redirect("/password");
  const app = (await listAppsForActor(actor)).find((a) => a.appKey === appKey && a.kind === "external");
  if (!app) return null;
  const launch = `/apps/launch/${encodeURIComponent(appKey)}`;
  return contracts.find((c) => c.appKey === appKey)?.embedPath
    ? { mode: "embed", title: app.displayName, src: launch }
    : { mode: "redirect", url: launch };
}

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
  const token = signPass(pass, secret);
  return contract.embedPath ? ssoEntryPath(contract.embedPath, token) : ssoEntryUrl(app.url, token);
}
