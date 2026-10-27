import { handlePhotoRequest } from "@/modules/apps/nakama";

// 名簿の顔写真(見られる人だけ、名簿に載っている在籍者の LINE WORKS のアイコンを返す)。
export async function GET(_request: Request, ctx: RouteContext<"/apps/nakama/photos/[id]">) {
  const { id } = await ctx.params;
  return handlePhotoRequest(id);
}
