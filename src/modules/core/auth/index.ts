// core/auth の公開 API(サーバー側専用)。
// クライアントコンポーネントから呼ぶ Server Action は ./actions を直接参照する
// (この index はサーバー専用の依存 pg / bcryptjs を含むため、クライアントから import しない)。
export { auth, handlers } from "./auth";
export { hashPassword, verifyPassword } from "./password";
export { LoginForm } from "./components/login-form";
export { PasswordForm } from "./components/password-form";
export { AuthShell } from "./components/auth-shell";
export { ForgotPasswordForm, ResetPasswordForm, EmailSettingsForm } from "./components/recovery-forms";
export { getEmailStatus, peekToken, verifyEmailToken } from "./recovery";
export { tokenSchema } from "./recovery-policy";
