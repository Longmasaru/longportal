import { handleNoticeFileRequest } from "@/modules/core/notices";

// お知らせの添付ファイル(そのお知らせを見てよい人だけ、R2 へ転送)。
export async function GET(_request: Request, ctx: RouteContext<"/notices/files/[id]">) {
  const { id } = await ctx.params;
  return handleNoticeFileRequest(id);
}
