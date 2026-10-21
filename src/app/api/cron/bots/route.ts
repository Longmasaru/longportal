import { handleBotsCron } from "@/modules/apps/bots";

// LINE WORKS の Bot の毎朝の実行(vercel.json の crons から呼ばれる)。docs/DESIGN.md 38 章。
export const maxDuration = 60;

export function GET(request: Request) {
  return handleBotsCron(request);
}
