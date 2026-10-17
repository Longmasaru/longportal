import { renderHaisouPage } from "@/modules/apps/haisou";

// 配達履歴。
export function GET() {
  return renderHaisouPage("history");
}
