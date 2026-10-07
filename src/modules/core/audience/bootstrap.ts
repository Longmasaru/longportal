import { eq } from "drizzle-orm";
import type { db } from "@/db/client";
import { audienceGroups, audiences } from "./schema";

type Executor = Pick<typeof db, "insert" | "select">;

export const ALL_EMPLOYEES_AUDIENCE_NAME = "全社員";

/**
 * 初期の Audience「全社員」(条件のない 1 グループ = いまアクセスできる全社員)を用意する(冪等)。
 * 公開したいものは必ず何らかの Audience を指定する方針(未設定は誰にも見せない)のため、最初から用意しておく。
 * 既にある場合は何も変更しない(名前や条件を管理画面で編集していても上書きしない)。
 */
export async function ensureDefaultAudiences(tx: Executor): Promise<boolean> {
  const [existing] = await tx
    .select({ id: audiences.id })
    .from(audiences)
    .where(eq(audiences.name, ALL_EMPLOYEES_AUDIENCE_NAME))
    .limit(1);
  if (existing) return false;
  const [created] = await tx
    .insert(audiences)
    .values({
      name: ALL_EMPLOYEES_AUDIENCE_NAME,
      description: "いまアクセスできるすべての社員(入社予定・退職済みは含みません)",
      isActive: true,
    })
    .returning({ id: audiences.id });
  await tx.insert(audienceGroups).values({ audienceId: created.id, sortOrder: 0 });
  return true;
}
