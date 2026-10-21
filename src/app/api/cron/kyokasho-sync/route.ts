import { handleSyncCron } from "@/modules/apps/kyokasho";

// ロングの教科書の、元の Google ドキュメントとの毎日の同期(vercel.json の crons から呼ばれる)。
export const maxDuration = 300;

export function GET(request: Request) {
  return handleSyncCron(request);
}
