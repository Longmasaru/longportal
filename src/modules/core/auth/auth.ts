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
import { isLoginThrottled, recordLoginAttempt } from "./throttle";
import { MAX_LOGIN_ID_LENGTH, MAX_LOGIN_PASSWORD_LENGTH, clientIpFrom } from "./throttle-policy";

/** パスワードは正しいが、アカウントが利用できない(無効・退職・入社前など)。 */
export class AccountUnavailableError extends CredentialsSignin {
  code = "account_unavailable";
}

/** 失敗が続いたため、一時的に試行を止めている。 */
export class TooManyAttemptsError extends CredentialsSignin {
  code = "too_many_attempts";
}

// ユーザーが存在しない場合も同じ時間だけパスワード照合を行い、応答時間から存在を推測されないようにする。
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer-not-a-real-password", 10);

// 異常に長い入力は、照合も記録もせずに弾く(bcrypt の負荷・記録の肥大化を避ける)。
const credentialsSchema = z.object({
  loginId: z.string().trim().toLowerCase().min(1).max(MAX_LOGIN_ID_LENGTH),
  password: z.string().min(1).max(MAX_LOGIN_PASSWORD_LENGTH),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        loginId: { label: "ログインID", type: "text" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { loginId, password } = parsed.data;
        const ip = clientIpFrom(request?.headers);

        // 失敗が続いている ID・接続元は、正しいパスワードでも照合せずに止める(存在しない ID も同じ扱い)。
        if (await isLoginThrottled(loginId, ip)) throw new TooManyAttemptsError();

        const [row] = await db
          .select({ user: users, employee: employees })
          .from(users)
          .leftJoin(employees, eq(users.employeeId, employees.id))
          .where(eq(users.loginId, loginId))
          .limit(1);

        const passwordOk = await verifyPassword(password, row?.user.passwordHash ?? DUMMY_HASH);
        if (!row || !passwordOk) {
          await recordLoginAttempt(loginId, ip, false);
          return null;
        }

        // パスワードは正しいので、失敗の記録はここで区切る(アカウントが使えない場合も同様)。
        await recordLoginAttempt(loginId, ip, true);

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
