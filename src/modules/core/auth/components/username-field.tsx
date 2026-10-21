/**
 * パスワードを変える画面に置く、見えないログイン ID の欄。
 * Chrome などのパスワード保存は、同じ form の中の username 欄を見て「どのアカウントのパスワードか」を決めるため、
 * これがあると、保存済みのパスワードを新しいものに更新する案内が正しく出る。
 */
export function UsernameForPasswordManager({ loginId }: { loginId: string }) {
  return (
    <input
      type="text"
      name="username"
      autoComplete="username"
      value={loginId}
      readOnly
      hidden
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
