import { handleImageRequest } from "@/modules/apps/kentei";

// 問題の図・実技の製作図(練習できる人だけ、R2 へ転送)。
export async function GET(_request: Request, ctx: RouteContext<"/apps/kentei/images/[id]">) {
  const { id } = await ctx.params;
  return handleImageRequest(id);
}
