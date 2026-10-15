// 姓(かな)・名(かな)の一括更新(確認済みの一覧から)。docs/DESIGN.md 22 章。
// 区切りのないかな(ヤマダタロウ)を姓と名に分けるときに使う。
// 安全のため、今のかな(name_kana)と、区切り(空白・中黒)を除いて文字が一致する行だけを更新する。
//
// 実行(既定は確認だけで、DB に書き込まない):
//   npm run db:update-name-kana -- <CSV のパス> --actor <ログインID> [--apply]
// CSV の見出し: employee_number,family_name_kana,given_name_kana(4 列目以降は確認用で、読まない)
// CSV には個人情報が入るため、リポジトリの中に置かないこと。出力にも氏名は出さない。
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { writeAuditLog } from "../src/modules/core/audit";
import { users } from "../src/modules/core/auth/schema";
import { normalizeText, parseCsv } from "../src/modules/core/employees/import";
import { employees } from "../src/modules/core/employees/schema";
import { assertTarget } from "./guard";

const HEADER = "employee_number,family_name_kana,given_name_kana";
const strip = (v: string | null) => (v ?? "").replace(/[\s　・]/g, "");

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const actorIndex = argv.indexOf("--actor");
  const actorLoginId = actorIndex >= 0 ? (argv[actorIndex + 1] ?? "").trim().toLowerCase() : "";
  const csvPath = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--actor");
  if (!csvPath || !actorLoginId) {
    throw new Error("使い方: npm run db:update-name-kana -- <CSV のパス> --actor <ログインID> [--apply]");
  }
  assertTarget("update-name-kana");

  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  // 4 列目以降(確認用の漢字の姓・名など)は読まない。
  if ((rows[0] ?? []).slice(0, 3).map((h) => h.trim()).join(",") !== HEADER) {
    throw new Error(`見出しの最初の 3 列は ${HEADER} にしてください。`);
  }
  const items = rows.slice(1).map((c, i) => ({
    line: i + 2,
    number: normalizeText(c[0] ?? ""),
    family: normalizeText(c[1] ?? "") || null,
    given: normalizeText(c[2] ?? "") || null,
  }));

  const [actor] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.loginId, actorLoginId));
  if (!actor || actor.status !== "active") throw new Error("--actor のアカウントが見つからないか、無効です。");

  const current = new Map((await db.select().from(employees)).map((e) => [e.employeeNumber, e]));
  const updates: { id: string; family: string | null; given: string | null }[] = [];
  const problems: string[] = [];
  let unchanged = 0;
  for (const it of items) {
    const e = current.get(it.number);
    if (!e) {
      problems.push(`${it.line} 行目: 社員番号 ${it.number} が見つかりません`);
    } else if (strip(e.nameKana) !== strip((it.family ?? "") + (it.given ?? ""))) {
      problems.push(`${it.line} 行目: 社員番号 ${it.number} のかなが、今のかなと一致しません`);
    } else if (e.familyNameKana === it.family && e.givenNameKana === it.given) {
      unchanged++;
    } else {
      updates.push({ id: e.id, family: it.family, given: it.given });
    }
  }

  console.log(`[kana] 更新する: ${updates.length} 件 / 変更なし: ${unchanged} 件 / 問題: ${problems.length} 件`);
  for (const p of problems) console.log(`  - ${p}`);
  if (!apply) {
    console.log("[kana] 確認だけで終了しました(DB は変更していません)。書き込むには --apply を付けてください。");
    return;
  }
  if (problems.length > 0) throw new Error("問題のある行があるため、何も更新していません。");

  await db.transaction(async (tx) => {
    for (const u of updates) {
      const [before] = await tx.select().from(employees).where(eq(employees.id, u.id));
      const [after] = await tx
        .update(employees)
        .set({ familyNameKana: u.family, givenNameKana: u.given })
        .where(eq(employees.id, u.id))
        .returning();
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "employee.update",
        targetType: "employee",
        targetId: u.id,
        before,
        after: { ...after, source: "split_name_kana" },
      });
    }
  });
  console.log(`[kana] 更新しました: ${updates.length} 件`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
