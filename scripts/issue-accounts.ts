// 社員のログインアカウントの一括発行。ログイン ID は社員番号(小文字)。
// 対象: 退職していない社員のうち、アカウントがまだなく、終了していない主所属がある人
// (画面からの発行と同じ条件)。初期パスワードは一人ずつ自動で作り、初回ログインで変更を求める。
//
// 実行(既定は確認だけで、DB に書き込まない):
//   npm run db:issue-accounts -- --actor <ログインID> --out <配布用 CSV のパス>
//   npm run db:issue-accounts -- --actor <ログインID> --out <配布用 CSV のパス> --apply
//
// 配布用 CSV(社員番号・氏名・ログイン ID・初期パスワード)は、--apply のときだけ書き出す。
// 初期パスワードが入るため、リポジトリの中には書き出せない。配り終えたら削除すること。
// 画面の出力には、社員の氏名もパスワードも出さない。
import { existsSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { writeAuditLog } from "../src/modules/core/audit";
import { generateTempPassword, hashPassword } from "../src/modules/core/auth/password";
import { users } from "../src/modules/core/auth/schema";
import { hasOpenPrimaryAssignment } from "../src/modules/core/employees/logic";
import { employeeAssignments, employees } from "../src/modules/core/employees/schema";
import { todayJst } from "../src/modules/core/shared/jst";
import { assertTarget } from "./guard";

const LOGIN_ID_PATTERN = /^[a-z0-9._-]{3,50}$/;

function parseArgs(argv: string[]) {
  let actorLoginId = "";
  let outPath = "";
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a === "--actor") actorLoginId = (argv[++i] ?? "").trim().toLowerCase();
    else if (a === "--out") outPath = argv[++i] ?? "";
    else throw new Error(`不明な引数: ${a}`);
  }
  if (!actorLoginId || !outPath) {
    throw new Error("使い方: npm run db:issue-accounts -- --actor <ログインID> --out <CSV のパス> [--apply]");
  }
  const absOut = resolve(outPath);
  const rel = relative(process.cwd(), absOut);
  if (!rel.startsWith("..") && !/^[a-zA-Z]:/.test(rel)) {
    throw new Error("--out にリポジトリの中は指定できません(初期パスワードが入るため)。");
  }
  if (existsSync(absOut)) throw new Error("--out のファイルが既にあります。別の名前を指定してください。");
  return { actorLoginId, outPath: absOut, apply };
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertTarget("issue-accounts");
  const today = todayJst();

  const [actor] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.loginId, args.actorLoginId));
  if (!actor || actor.status !== "active") throw new Error("--actor のアカウントが見つからないか、無効です。");

  const candidates = await db
    .select({ id: employees.id, number: employees.employeeNumber, name: employees.name })
    .from(employees)
    .leftJoin(users, eq(users.employeeId, employees.id))
    .where(and(ne(employees.status, "retired"), isNull(users.id)))
    .orderBy(employees.employeeNumber);

  const assignments = candidates.length
    ? await db
        .select({
          employeeId: employeeAssignments.employeeId,
          isPrimary: employeeAssignments.isPrimary,
          endDate: employeeAssignments.endDate,
        })
        .from(employeeAssignments)
        .where(inArray(employeeAssignments.employeeId, candidates.map((c) => c.id)))
    : [];
  const takenLoginIds = new Set((await db.select({ loginId: users.loginId }).from(users)).map((u) => u.loginId));

  const targets: typeof candidates = [];
  let noAssignment = 0;
  const badIds: string[] = [];
  for (const c of candidates) {
    const loginId = c.number.toLowerCase();
    if (!hasOpenPrimaryAssignment(assignments.filter((a) => a.employeeId === c.id), today)) {
      noAssignment++;
    } else if (!LOGIN_ID_PATTERN.test(loginId) || takenLoginIds.has(loginId)) {
      badIds.push(c.number);
    } else {
      targets.push(c);
    }
  }

  console.log(`[issue] 発行する: ${targets.length} 件 / 主所属がないため飛ばす: ${noAssignment} 件`);
  if (badIds.length > 0) {
    console.log(`[issue] 社員番号をログイン ID に使えないため飛ばす(使用済み・形式違い): ${badIds.join("、")}`);
  }
  if (!args.apply) {
    console.log("[issue] 確認だけで終了しました(DB は変更していません)。発行するには --apply を付けてください。");
    return;
  }

  const issued: { number: string; name: string; loginId: string; password: string }[] = [];
  await db.transaction(async (tx) => {
    for (const t of targets) {
      const loginId = t.number.toLowerCase();
      const password = generateTempPassword();
      const [created] = await tx
        .insert(users)
        .values({
          loginId,
          passwordHash: await hashPassword(password),
          employeeId: t.id,
          status: "active",
          mustChangePassword: true,
        })
        .returning({ id: users.id });
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "user.create",
        targetType: "user",
        targetId: created.id,
        after: { loginId, employeeId: t.id, status: "active", source: "bulk_issue" },
      });
      issued.push({ number: t.number, name: t.name, loginId, password });
    }
    // 確定(コミット)の前に書き出す。書き出せなければ、発行も取り消される
    // (パスワードの分からないアカウントを残さない)。Excel で文字化けしないよう、BOM 付きの UTF-8。
    const lines = [
      "社員番号,氏名,ログインID,初期パスワード",
      ...issued.map((i) => [i.number, i.name, i.loginId, i.password].map(csvField).join(",")),
    ];
    writeFileSync(args.outPath, "﻿" + lines.join("\r\n") + "\r\n", { encoding: "utf8", flag: "wx" });
  });

  console.log(`[issue] 発行しました: ${issued.length} 件。配布用の CSV を書き出しました: ${args.outPath}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
