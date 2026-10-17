import { handleRpc } from "@/modules/apps/haisou";

// 画面からのサーバー呼び出し(元の google.script.run の代わり)。
export function POST(request: Request) {
  return handleRpc(request);
}
