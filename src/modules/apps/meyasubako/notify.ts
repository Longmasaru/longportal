import { listPermissionHolders } from "@/modules/core/access";
import { createAppNotice } from "@/modules/core/notices";
import {
  CATEGORY_LABEL,
  DESTINATION_LABEL,
  LEADER_PERMISSION,
  MANAGE_PERMISSION,
  VISIBILITY_LABEL,
  type MeyasubakoCategory,
  type MeyasubakoDestination,
  type MeyasubakoVisibility,
} from "./constants";

// 新しい投稿を、返事ができる人の「お知らせ → 個人」に届ける(docs/DESIGN.md 42 章)。
// お知らせの本文は「お知らせ管理」でも見えるので、投稿の内容・投稿者の名前は入れない(種類と宛先とリンクだけ)。

export async function noticeNewPost(input: {
  postId: string;
  authorUserId: string;
  category: MeyasubakoCategory;
  destination: MeyasubakoDestination;
  visibility: MeyasubakoVisibility;
  locationId: string | null;
  departmentId: string | null;
  today: string;
  /** リンクの先頭(例: https://long-ishikawa.com)。分からなければリンクなし。 */
  origin: string | null;
}): Promise<void> {
  const [managers, leaders] = await Promise.all([
    listPermissionHolders(MANAGE_PERMISSION, {}, input.today),
    input.destination === "leader"
      ? listPermissionHolders(
          LEADER_PERMISSION,
          { locationId: input.locationId, departmentId: input.departmentId },
          input.today,
        )
      : Promise.resolve([]),
  ]);
  const recipientEmployeeIds = [...managers, ...leaders]
    .filter((h) => h.userId !== input.authorUserId && h.employeeId)
    .map((h) => h.employeeId!);

  const category = CATEGORY_LABEL[input.category].label;
  await createAppNotice({
    title: `目安箱に新しい投稿【${category}】`,
    body: [
      "目安箱に新しい投稿が届きました。",
      `${DESTINATION_LABEL[input.destination]}・${VISIBILITY_LABEL[input.visibility].label}`,
      "",
      "内容は目安箱で見て、返事や対応の状況を入れてください。",
      input.origin ? `${input.origin}/apps/meyasubako/${input.postId}` : "",
    ]
      .filter((line, i, all) => line !== "" || i < all.length - 1)
      .join("\n"),
    kind: input.category === "hazard" ? "safety" : "general",
    priority: input.category === "hazard" ? "important" : "normal",
    recipientEmployeeIds,
    today: input.today,
  });
}
