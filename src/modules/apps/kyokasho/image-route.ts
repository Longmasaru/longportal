// 教科書の画像の入口(/apps/kyokasho/images/<id>)。その教科書を見られる人だけを、R2 の署名付き URL へ転送する。
// 署名付き URL は 5 分で切れるので、ページには固定のこの住所を書き、表示のたびに転送する。
import { z } from "zod";
import { requireAppAccess } from "@/modules/core/apps";
import { createViewUrl, SIGNED_URL_TTL_SECONDS } from "@/modules/core/storage";
import { manifest } from "./manifest";
import { findImageForActor } from "./queries";

export async function handleImageRequest(id: string): Promise<Response> {
  const actor = await requireAppAccess(manifest.appKey);
  if (!z.uuid().safeParse(id).success) return new Response("Not Found", { status: 404 });
  const image = await findImageForActor(actor, id);
  if (!image) return new Response("Not Found", { status: 404 });
  const url = await createViewUrl({ key: image.storageKey, contentType: image.contentType });
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      // 転送先の期限より短い間だけ、本人のブラウザに覚えさせる。
      "Cache-Control": `private, max-age=${Math.max(0, SIGNED_URL_TTL_SECONDS - 60)}`,
    },
  });
}
