import Link from "next/link";
import { AuthShell, ResetPasswordForm, peekToken, tokenSchema } from "@/modules/core/auth";

export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const { token } = await props.searchParams;
  const parsed = tokenSchema.safeParse(token);
  const usable = parsed.success && (await peekToken(parsed.data, "password_reset"));

  return (
    <AuthShell title="パスワードの再設定">
      {usable ? (
        <ResetPasswordForm token={parsed.data} />
      ) : (
        <div className="flex flex-col gap-5 text-sm">
          <p className="text-brand01 leading-relaxed">
            このリンクは使えません(期限切れ・使用済み)。お手数ですが、もう一度やり直してください。
          </p>
          <Link href="/forgot-password" className="text-brand01 hover:text-brand03 text-center font-bold transition-colors">
            「パスワードを忘れた方」へ
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
