import { AuthShell, ForgotPasswordForm } from "@/modules/core/auth";

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="パスワードを忘れた方">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
