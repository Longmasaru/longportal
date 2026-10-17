import { renderHaisouPage } from "@/modules/apps/haisou";

// 取引先の管理。
export function GET() {
  return renderHaisouPage("clients");
}
