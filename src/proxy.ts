import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/modules/core/auth/auth.config";

// 粗い入口制御(ログイン済みか)だけを行う。DB 参照を伴う本判定(ユーザーの有効性・在籍状態・
// 権限・Audience)は modules/core/access で、page / layout / Server Action ごとに行う。
// Server Action は別ルートへの POST として扱われ、matcher 次第で proxy を通らないことがあるため、
// proxy を認可の根拠にしない。
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
});

// /aikyoshitsu/…・/order-csv/… は別プロジェクトのアプリへの転送(next.config の rewrites)。ログインの確認はアプリ側が行う。
export const config = {
  // ログインしていなくても開ける画面: ログイン、パスワードを忘れた方・再設定・メールの確認(docs/DESIGN.md 26 章)。
  // api/cron は Vercel Cron の入口(CRON_SECRET で本判定する。docs/DESIGN.md 30 章)。
  matcher: [
    "/((?!api/auth|api/cron|login|forgot-password|reset-password|verify-email|_next/static|_next/image|favicon.ico|aikyoshitsu(?:/|$)|order-csv(?:/|$)).*)",
  ],
};
