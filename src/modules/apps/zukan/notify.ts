import { listPermissionHolders } from "@/modules/core/access";
import { createAppNotice } from "@/modules/core/notices";
import { APPRAISE_PERMISSION, CHAPTER_LABEL, formatNo, type ZukanChapter } from "./constants";

// カイゼン図鑑のお知らせ(docs/DESIGN.md 44 章)。お知らせの本文は「お知らせ管理」でも見えるので、
// 番号・章とリンクだけを入れる(点数・本文は入れない)。

function link(origin: string | null, entryId: string): string {
  return origin ? `${origin}/apps/zukan/${entryId}` : "";
}

/** 新しいページを、鑑定する人の「お知らせ → 個人」に届ける(本人は除く)。 */
export async function noticeNewEntry(input: {
  entryId: string;
  number: number;
  chapter: ZukanChapter;
  authorUserId: string;
  today: string;
  origin: string | null;
}): Promise<void> {
  const holders = await listPermissionHolders(APPRAISE_PERMISSION, {}, input.today);
  const recipientEmployeeIds = holders
    .filter((h) => h.userId !== input.authorUserId && h.employeeId)
    .map((h) => h.employeeId!);
  await createAppNotice({
    title: `カイゼン図鑑に ${formatNo(input.number)} が登録されました【${CHAPTER_LABEL[input.chapter].label}】`,
    body: ["カイゼン図鑑に新しいページが登録されました。鑑定待ちから点数を付けてください。", link(input.origin, input.entryId)]
      .filter(Boolean)
      .join("\n"),
    recipientEmployeeIds,
    today: input.today,
  });
}

/** 鑑定の結果が出たことを、本人に届ける。 */
export async function noticeAppraised(input: {
  entryId: string;
  number: number;
  authorEmployeeId: string | null;
  today: string;
  origin: string | null;
}): Promise<void> {
  if (!input.authorEmployeeId) return;
  await createAppNotice({
    title: `カイゼン図鑑 ${formatNo(input.number)} の鑑定が終わりました`,
    body: ["あなたが登録したページの鑑定が終わりました。図鑑のページを開くと、レア度が分かります。", link(input.origin, input.entryId)]
      .filter(Boolean)
      .join("\n"),
    recipientEmployeeIds: [input.authorEmployeeId],
    today: input.today,
  });
}
