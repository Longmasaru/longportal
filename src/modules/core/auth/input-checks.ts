import { MIN_PASSWORD_LENGTH } from "./password-policy";

// 入力の見直しを助ける、純粋な判定(画面とサーバーの両方から使う。DB に依存しない)。

/**
 * ログイン ID を照合用の形にそろえる。全角の数字・英字(「１００５」など)は半角に、
 * 前後や途中の空白は取り除き、英字は小文字にする(ID は常に小文字で保存している)。
 */
export function normalizeLoginId(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/** パスワード欄の入力で、まちがいの原因になりやすいものの注意書き(入力中に表示する)。 */
export function passwordInputWarnings(value: string): string[] {
  const warnings: string[] = [];
  // 全角の英数字・かな・漢字など(半角の英数字・記号以外)。日本語入力がオンのまま打った場合に多い。
  if (/[^\x20-\x7e]/.test(value)) {
    warnings.push("全角の文字(またはかな・漢字)が入っています。日本語入力をオフにして、半角で入力してください。");
  }
  if (value !== value.trim()) warnings.push("先頭か最後に空白が入っています。");
  return warnings;
}

export type NewPasswordCheck = { label: string; ok: boolean };

/** 新しいパスワードの条件を、1 つずつ満たしているかの一覧(入力中に表示する)。 */
export function newPasswordChecks(
  newPassword: string,
  confirmPassword: string,
  currentPassword?: string,
): NewPasswordCheck[] {
  const length = [...newPassword].length;
  const checks: NewPasswordCheck[] = [
    {
      label:
        length >= MIN_PASSWORD_LENGTH
          ? `${MIN_PASSWORD_LENGTH}文字以上(いま${length}文字)`
          : `${MIN_PASSWORD_LENGTH}文字以上(いま${length}文字。あと${MIN_PASSWORD_LENGTH - length}文字)`,
      ok: length >= MIN_PASSWORD_LENGTH,
    },
  ];
  if (currentPassword !== undefined) {
    checks.push({
      label: "現在のパスワードと違う",
      ok: newPassword.length > 0 && newPassword !== currentPassword,
    });
  }
  checks.push({
    label: "確認の欄と同じ",
    ok: confirmPassword.length > 0 && newPassword === confirmPassword,
  });
  return checks;
}
