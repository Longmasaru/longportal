import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/db/client";
import { evaluateUserAccess } from "../access/evaluate";
import { employees } from "../employees/schema";
import { todayJst } from "../shared/jst";
import { authConfig } from "./auth.config";
import { verifyPassword } from "./password";
import { users } from "./schema";

/** パスワードは正しいが、アカウントが利用できない(無効・退職・入社前など)。 */
export class AccountUnavailableError extends CredentialsSignin {
  code = "account_unavailable";
}

// ユーザーが存在しない場合も同じ時間だけパスワード照合を行い、応答時間から存在を推測されないようにする。
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer-not-a-real-password", 10);

const credentialsSchema = z.object({
  loginId: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        loginId: { label: "ログインID", type: "text" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { loginId, password } = parsed.data;

        const [row] = await db
          .select({ user: users, employee: employees })
          .from(users)
          .leftJoin(employees, eq(users.employeeId, employees.id))
          .where(eq(users.loginId, loginId))
          .limit(1);

        const passwordOk = await verifyPassword(password, row?.user.passwordHash ?? DUMMY_HASH);
        if (!row || !passwordOk) return null;

        // ログイン時点でも、毎回のアクセス判定(resolveActor)と同じ規則で利用可否を確認する。
        if (evaluateUserAccess(row.user, row.employee, todayJst()) !== null) {
          throw new AccountUnavailableError();
        }

        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.user.id));
        return { id: row.user.id };
      },
    }),
  ],
});
