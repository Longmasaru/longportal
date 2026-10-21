import { handlePhotoRequest } from "@/modules/apps/soshikizu";

// 組織図の顔写真(見られる人だけ、LINE WORKS のアイコンを返す)。
export async function GET(_request: Request, ctx: RouteContext<"/apps/soshikizu/photos/[id]">) {
  const { id } = await ctx.params;
  return handlePhotoRequest(id);
}
