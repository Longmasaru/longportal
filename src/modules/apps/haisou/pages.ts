// 画面の入口。元の Apps Script の HTML を、そのままの見た目・動きで返す(docs/DESIGN.md 29 章)。
// 使えない人には 404(requireAppAccess)。サーバーの呼び出しは ui/shim.ts が /apps/haisou/api に置き換える。
import { requireAppAccess } from "@/modules/core/apps";
import { manifest } from "./manifest";
import { CLIENTS_HTML } from "./ui/clients";
import { DIALOG_HTML } from "./ui/dialog";
import { HISTORY_HTML } from "./ui/history";
import { RPC_SHIM } from "./ui/shim";

const PAGES = { route: DIALOG_HTML, clients: CLIENTS_HTML, history: HISTORY_HTML } as const;
export type HaisouPage = keyof typeof PAGES;

/** 最初の <script> の前に、google.script.run の置き換えを差し込む。 */
function withShim(html: string): string {
  const i = html.indexOf("<script>");
  return i < 0 ? html : html.slice(0, i) + RPC_SHIM + html.slice(i);
}

export async function renderHaisouPage(page: HaisouPage): Promise<Response> {
  await requireAppAccess(manifest.appKey);
  return new Response(withShim(PAGES[page]), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
