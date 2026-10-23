// お知らせの添付ファイルの入口(/notices/files/<id>)。そのお知らせを見てよい人だけを、R2 の署名付き URL へ転送する。
// 見てよい人: お知らせが届いている人(掲載中・宛先に当てはまる)と、お知らせを管理する人(下書きの確認のため。
// 個人宛ては core.notices.individual も要る)。署名付き URL は 5 分で切れるので、ページには固定のこの住所を書く。
import { z } from "zod";
import { canGlobally, requireActor } from "../access";
import { createDownloadUrl, createViewUrl, SIGNED_URL_TTL_SECONDS } from "../storage";
import { isInlineNoticeImage } from "./logic";
import { findNoticeAttachment, getNoticeForActor } from "./queries";

export async function handleNoticeFileRequest(id: string): Promise<Response> {
  const actor = await requireActor();
  const notFound = () => new Response("Not Found", { status: 404 });
  if (!z.uuid().safeParse(id).success) return notFound();
  const row = await findNoticeAttachment(id);
  if (!row) return notFound();

  const asManager =
    canGlobally(actor, "core.notices.manage") &&
    (row.target !== "individual" || canGlobally(actor, "core.notices.individual"));
  if (!asManager && !(await getNoticeForActor(actor, row.attachment.announcementId))) return notFound();

  const { storageKey, contentType, fileName } = row.attachment;
  // 画像と PDF は、その場で開く。それ以外は、元のファイル名でダウンロードさせる。
  const url =
    isInlineNoticeImage(contentType) || contentType === "application/pdf"
      ? await createViewUrl({ key: storageKey, contentType })
      : await createDownloadUrl({ key: storageKey, fileName });
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      // 転送先の期限より短い間だけ、本人のブラウザに覚えさせる。
      "Cache-Control": `private, max-age=${Math.max(0, SIGNED_URL_TTL_SECONDS - 60)}`,
    },
  });
}
