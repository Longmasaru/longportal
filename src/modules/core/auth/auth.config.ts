import type { NextAuthConfig } from "next-auth";

// 12時間(1 営業日)。JWT なのでサーバー側から失効させられない分、短めにしている。
// ユーザーの有効性・在籍状態・権限は JWT では判断せず、毎回 DB で確認する(modules/core/access)。
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

/**
 * Edge/proxy からも読み込める最小構成(pg・bcryptjs に依存する Credentials provider を含まない)。
 * JWT に載せるのは認証に必要な最小限の ID(userId)だけ。
 */
export const authConfig = {
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      // 氏名・メールなどの個人情報はトークンに載せない。
      delete token.name;
      delete token.email;
      delete token.picture;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
