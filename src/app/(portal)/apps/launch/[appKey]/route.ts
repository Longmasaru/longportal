import { EXTERNAL_APP_CONTRACTS } from "@/modules/apps/external-apps";
import { resolveLaunchUrl } from "@/modules/core/sso";

// サイドバーのアプリを開く入口。別プロジェクトのアプリには、通行証をつけて移動させる(docs/DESIGN.md 28 章)。
export async function GET(_request: Request, ctx: RouteContext<"/apps/launch/[appKey]">) {
  const { appKey } = await ctx.params;
  const target = await resolveLaunchUrl(appKey, EXTERNAL_APP_CONTRACTS);
  if (!target) return new Response("Not Found", { status: 404 });
  const location = target.startsWith("/") ? new URL(target, _request.url).toString() : target;
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
