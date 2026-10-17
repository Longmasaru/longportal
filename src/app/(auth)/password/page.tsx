import { requireActor } from "@/modules/core/access";
import { AuthShell, EmailSettingsForm, PasswordForm, getEmailStatus } from "@/modules/core/auth";

export default async function PasswordPage() {
  const actor = await requireActor();
  const { email, verified } = await getEmailStatus(actor.userId);
  // 初回ログインのときは、パスワードの変更と一緒にメールアドレスを登録してもらう。
  // それ以外は、メールアドレスだけを下の欄で登録・変更できる。
  const requireEmail = actor.mustChangePassword;

  return (
    <AuthShell title="パスワードの変更">
      <PasswordForm forced={actor.mustChangePassword} requireEmail={requireEmail} currentEmail={email} />
      {!actor.mustChangePassword ? (
        <div className="border-brand01/15 mt-8 border-t pt-6">
          <h2 className="text-brand01 mb-4 text-center font-bold">メールアドレス</h2>
          <EmailSettingsForm email={email} verified={verified} />
        </div>
      ) : null}
    </AuthShell>
  );
}
