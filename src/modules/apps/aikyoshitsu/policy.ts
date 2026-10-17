// AI教室の入力の規則(DB・ネットワークに依存しない純粋な関数と検証)。docs/DESIGN.md 28 章。
import { z } from "zod";
import { isIsoDate } from "@/modules/core/shared/date";

/** 受け付ける資料の種類(元のファイルをそのまま表示できるもの)。 */
export const MATERIAL_CONTENT_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export type MaterialContentType = (typeof MATERIAL_CONTENT_TYPES)[number];

export const MATERIAL_MAX_MB = 25;

const EXTENSION_TYPES: Record<string, MaterialContentType> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/**
 * ファイルの種類を決める。ブラウザが種類を渡さないこともあるので、拡張子からも判断する。
 * 受け付けない種類なら null。
 */
export function materialContentType(fileName: string, browserType: string): MaterialContentType | null {
  if ((MATERIAL_CONTENT_TYPES as readonly string[]).includes(browserType)) return browserType as MaterialContentType;
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return null;
  return EXTENSION_TYPES[fileName.slice(dot + 1).toLowerCase()] ?? null;
}

export function isPdf(contentType: string): boolean {
  return contentType === "application/pdf";
}

/** 回のタイトルと実施日。 */
export const sessionInputSchema = z.object({
  title: z.string().trim().min(1, "回のタイトルを入力してください。").max(100, "回のタイトルは100文字以内にしてください。"),
  heldOn: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || isIsoDate(v), "実施日は正しい日付で入力してください。"),
});
export type SessionInput = z.input<typeof sessionInputSchema>;

/** 並び順: 実施日のある回は日付順、未定の回はその後ろ。同じなら並び順・作成順。 */
export function compareSessions(
  a: { heldOn: string | null; sortOrder: number; createdAt: Date },
  b: { heldOn: string | null; sortOrder: number; createdAt: Date },
): number {
  if (a.heldOn !== b.heldOn) {
    if (a.heldOn === null) return 1;
    if (b.heldOn === null) return -1;
    return a.heldOn < b.heldOn ? -1 : 1;
  }
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.createdAt.getTime() - b.createdAt.getTime();
}
