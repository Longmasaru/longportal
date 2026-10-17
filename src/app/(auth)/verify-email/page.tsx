import Link from "next/link";
import { AuthShell, tokenSchema, verifyEmailToken } from "@/modules/core/auth";

// メールの確認(ログインしていなくても開ける)。リンクを開いた時点で確認済みにする(docs/DESIGN.md 26 章)。
export default async function VerifyEmailPage(props: PageProps<"/verify-email">) {
  const { token } = await props.searchParams;
  const parsed = tokenSchema.safeParse(token);
  const result = parsed.success ? await verifyEmailToken(parsed.data) : "invalid";

  return (
    <AuthShell title="メールアドレスの確認">
      <div className="flex flex-col gap-5 text-sm">
        <p className="text-brand01 leading-relaxed">
          {result === "verified"
            ? "メールアドレスの確認が完了しました。パスワードを忘れたときは、このアドレスに再設定の案内が届きます。"
            : "このリンクは使えません(期限切れ・使用済み、またはアドレスが変更されています)。ポータルの「パスワードの変更」画面から、確認のメールを送り直してください。"}
        </p>
        <Link href="/" className="text-brand01 hover:text-brand03 text-center font-bold transition-colors">
          ポータルへ
        </Link>
      </div>
    </AuthShell>
  );
}
