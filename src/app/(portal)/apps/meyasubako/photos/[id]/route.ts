import { handlePhotoRequest } from "@/modules/apps/meyasubako";

// 目安箱の写真(その投稿を見られる人だけ、R2 へ転送)。
export async function GET(_request: Request, ctx: RouteContext<"/apps/meyasubako/photos/[id]">) {
  const { id } = await ctx.params;
  return handlePhotoRequest(id);
}
