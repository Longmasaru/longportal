/** `YYYY-MM-DD` を `YYYY.MM.DD`(デザイン仕様の日付表記)に変換する。 */
export function formatDateDot(isoDate: string): string {
  return isoDate.slice(0, 10).replaceAll("-", ".");
}
