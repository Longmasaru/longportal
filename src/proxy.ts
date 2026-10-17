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

// /aikyoshitsu/… は別プロジェクトのアプリへの転送(next.config の rewrites)。ログインの確認はアプリ側が行う。
export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico|aikyoshitsu(?:/|$)).*)"],
};
