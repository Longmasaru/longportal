import { AuthShell, LoginForm } from "@/modules/core/auth";

const REASON_MESSAGE =
  "このアカウントは現在ご利用いただけません。管理者に確認してください。";

// アクセス判定で拒否された理由(requireActor が付ける)。詳細な理由は利用者には見せない。
const DENIED_REASONS = new Set([
  "user_disabled",
  "user_not_found",
  "employee_not_active",
  "not_yet_hired",
  "left_company",
]);

export default async function LoginPage(props: PageProps<"/login">) {
  const { reason, reset } = await props.searchParams;
  const denied = typeof reason === "string" && DENIED_REASONS.has(reason);
  const info = reset === "done" ? "パスワードを変更しました。新しいパスワードでログインしてください。" : undefined;

  return (
    <AuthShell title="ログイン">
      <LoginForm notice={denied ? REASON_MESSAGE : undefined} info={info} />
    </AuthShell>
  );
}
