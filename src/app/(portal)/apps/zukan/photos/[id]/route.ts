import { handlePhotoRequest } from "@/modules/apps/zukan";

// カイゼン図鑑の写真(そのページを見られる人だけ、R2 へ転送)。
export async function GET(_request: Request, ctx: RouteContext<"/apps/zukan/photos/[id]">) {
  const { id } = await ctx.params;
  return handlePhotoRequest(id);
}
