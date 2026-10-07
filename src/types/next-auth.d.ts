import type { DefaultSession } from "next-auth";

// JWT・セッションに載せるのは認証に必要な最小限の ID(userId)だけ。
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}
