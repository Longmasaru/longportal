// pg のエラーコードを取り出す。Drizzle は pg のエラーを DrizzleQueryError で包み、元のエラーを cause に持つ。
function findPgCode(err: unknown, depth = 0): string | undefined {
  if (typeof err !== "object" || err === null || depth > 3) return undefined;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  return findPgCode((err as { cause?: unknown }).cause, depth + 1);
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
export const PG_CHECK_VIOLATION = "23514";
/** 排他制約(EXCLUDE)違反。主所属の期間重複など。 */
export const PG_EXCLUSION_VIOLATION = "23P01";

export function pgErrorCode(err: unknown): string | undefined {
  return findPgCode(err);
}

/** 違反した制約名(あれば)。 */
export function pgConstraintName(err: unknown, depth = 0): string | undefined {
  if (typeof err !== "object" || err === null || depth > 3) return undefined;
  const c = (err as { constraint?: unknown }).constraint;
  if (typeof c === "string") return c;
  return pgConstraintName((err as { cause?: unknown }).cause, depth + 1);
}
