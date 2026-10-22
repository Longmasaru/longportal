import { handleTalkRequest } from "@/modules/apps/soshikizu";

// 組織図から、その人との LINE WORKS のトークへ(見られる人だけ)。
export async function GET(_request: Request, ctx: RouteContext<"/apps/soshikizu/talk/[id]">) {
  const { id } = await ctx.params;
  return handleTalkRequest(id);
}
