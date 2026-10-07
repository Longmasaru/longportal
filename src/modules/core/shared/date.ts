// `YYYY-MM-DD` の暦日どうしの計算(タイムゾーンの影響を受けない純粋関数)。

/** 暦日に日数を足す(負の値で引く)。 */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** 2 つの暦日の差(b - a、日数)。 */
export function diffDays(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` の実在する日付か。 */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return addDays(value, 0) === value;
}
