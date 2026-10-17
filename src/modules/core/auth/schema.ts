import { sql } from "drizzle-orm";
import { boolean, check, index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { employees } from "../employees/schema";
import { core, idColumn, timestamps } from "../shared/schema-helpers";

/** システム利用可否。社員の人事上の状態(employees.status)とは別。 */
export const USER_STATUSES = ["active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * ポータルへログインする認証アカウント。
 * employee と 1 対 0..1(employee_id は UNIQUE・NULL 可)。社員以外の user も作れる。
 */
export const users = core.table(
  "users",
  {
    id: idColumn(),
    /** ログイン ID。常に小文字で保存する(CHECK 制約で担保)。 */
    loginId: text("login_id").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    employeeId: uuid("employee_id")
      .unique()
      .references(() => employees.id, { onDelete: "restrict" }),
    status: text("status").$type<UserStatus>().notNull().default("active"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** パスワードを忘れたときの連絡先(小文字で保存)。初回ログインで本人が登録する(docs/DESIGN.md 26 章)。 */
    email: text("email"),
    /** 確認メールのリンクを本人が開いた日時。再設定のメールは、確認済みのアドレスにだけ送る。 */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    check("users_status_check", sql`${t.status} in ('active', 'disabled')`),
    check("users_login_id_lowercase", sql`${t.loginId} = lower(${t.loginId})`),
    check("users_email_lowercase", sql`${t.email} is null or ${t.email} = lower(${t.email})`),
    uniqueIndex("users_email_unique").on(t.email),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * ログインの試行の記録(失敗回数の制限用)。入力されたログイン ID(小文字化済み)ごとに記録するので、
 * 存在しない ID も同じように数えられ、ID の有無は推測できない。古い記録は、記録のついでに削除する。
 */
export const loginAttempts = core.table(
  "login_attempts",
  {
    id: idColumn(),
    loginId: text("login_id").notNull(),
    /** 接続元(取れなければ NULL) */
    ip: text("ip"),
    succeeded: boolean("succeeded").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_login_id_attempted_at_idx").on(t.loginId, t.attemptedAt),
    index("login_attempts_ip_attempted_at_idx").on(t.ip, t.attemptedAt),
  ],
);

export const AUTH_TOKEN_PURPOSES = ["email_verify", "password_reset"] as const;
export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number];

/**
 * メール確認・パスワード再設定のトークン(docs/DESIGN.md 26 章)。トークン本体は保存せず、SHA-256 だけを持つ。
 * 1 回使ったら used_at を入れて無効にする。
 */
export const authTokens = core.table(
  "auth_tokens",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<AuthTokenPurpose>().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** 確認するアドレス(メール確認用)。送った先の記録にもなる。 */
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("auth_tokens_purpose_check", sql`${t.purpose} in ('email_verify', 'password_reset')`),
    index("auth_tokens_user_id_purpose_idx").on(t.userId, t.purpose),
  ],
);
