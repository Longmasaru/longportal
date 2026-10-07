import { requireActor } from "@/modules/core/access";
import { AuthShell, PasswordForm } from "@/modules/core/auth";

export default async function PasswordPage() {
  const actor = await requireActor();

  return (
    <AuthShell title="パスワードの変更">
      <PasswordForm forced={actor.mustChangePassword} />
    </AuthShell>
  );
}
