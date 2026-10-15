// 管理者の復旧用: 指定した login_id のパスワードを、仮のパスワードに再設定する。
// 管理画面に入れない(パスワードを忘れた)ときに使う。次のログインでパスワードの変更を求め、
// 失敗回数によるロックも解除する。仮のパスワードは画面に出さず、--out のファイルに書く。
//
// 実行: npm run db:reset-password -- <login_id> --out <ファイルのパス>
// ファイルはリポジトリの中には書けない。ログインしてパスワードを変えたら、削除すること。
import { existsSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { writeAuditLog } from "../src/modules/core/audit";
import { generateTempPassword, hashPassword } from "../src/modules/core/auth/password";
import { users } from "../src/modules/core/auth/schema";
import { clearLoginFailures } from "../src/modules/core/auth/throttle";
import { assertTarget } from "./guard";

async function main(): Promise<void> {
  const [loginIdArg, flag, outArg] = process.argv.slice(2);
  if (!loginIdArg || flag !== "--out" || !outArg) {
    throw new Error("使い方: npm run db:reset-password -- <login_id> --out <ファイルのパス>");
  }
  const loginId = loginIdArg.trim().toLowerCase();
  const outPath = resolve(outArg);
  const rel = relative(process.cwd(), outPath);
  if (!rel.startsWith("..") && !/^[a-zA-Z]:/.test(rel)) {
    throw new Error("--out にリポジトリの中は指定できません(仮のパスワードが入るため)。");
  }
  if (existsSync(outPath)) throw new Error("--out のファイルが既にあります。別の名前を指定してください。");
  assertTarget("reset-password");

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);
  const found = await db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.loginId, loginId));
    if (!user) return false;
    await tx.update(users).set({ passwordHash, mustChangePassword: true }).where(eq(users.id, user.id));
    // スクリプトでの復旧は、本人が行う操作として記録する。
    await writeAuditLog(tx, {
      actorUserId: user.id,
      action: "user.password_reset",
      targetType: "user",
      targetId: user.id,
      after: { mustChangePassword: true, source: "reset_script" },
    });
    // 確定(コミット)の前に書き出す。書き出せなければ、再設定も取り消される。
    writeFileSync(outPath, `ログインID: ${loginId}\r\n仮のパスワード: ${password}\r\n`, { encoding: "utf8", flag: "wx" });
    return true;
  });
  if (!found) {
    console.log(`[reset-password] ユーザー ${loginId} が見つかりません。`);
    process.exitCode = 1;
    return;
  }
  await clearLoginFailures(loginId);
  console.log(`[reset-password] ${loginId} のパスワードを再設定しました(次のログインで変更が必要)。仮のパスワードは ${outPath} に書きました。`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
