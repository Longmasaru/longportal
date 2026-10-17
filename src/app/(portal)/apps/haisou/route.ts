import { renderHaisouPage } from "@/modules/apps/haisou";

// 配達ルート作成(元の Apps Script の画面をそのまま返す)。
export function GET() {
  return renderHaisouPage("route");
}
