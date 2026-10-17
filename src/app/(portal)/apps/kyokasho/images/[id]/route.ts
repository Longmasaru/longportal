import { handleImageRequest } from "@/modules/apps/kyokasho";

// 教科書の画像(見られる人だけ、R2 へ転送)。
export async function GET(_request: Request, ctx: RouteContext<"/apps/kyokasho/images/[id]">) {
  const { id } = await ctx.params;
  return handleImageRequest(id);
}
