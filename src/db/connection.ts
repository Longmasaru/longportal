/**
 * 接続文字列の sslmode を正規化する。
 * pg は sslmode=require / prefer / verify-ca を現状 verify-full と同じ意味で扱い、
 * 次のメジャーで意味が変わる旨の警告を出す。挙動は変えずに警告だけ避けるため、明示的に verify-full にする。
 */
export function normalizeDatabaseUrl(url: string): string {
  if (!url) return url;
  const parsed = new URL(url);
  const mode = parsed.searchParams.get("sslmode");
  if (mode === "require" || mode === "prefer" || mode === "verify-ca") {
    parsed.searchParams.set("sslmode", "verify-full");
  }
  return parsed.toString();
}
