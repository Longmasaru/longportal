// 生年月日の一括登録(社員名簿から)。docs/DESIGN.md 37 章。
// 社員番号で既存の社員に生年月日を入れる(社員の追加はしない)。すでに同じ日付なら何もしない。
//
// 実行(既定は確認だけで、DB に書き込まない):
//   npm run db:import-birth-dates -- <CSV のパス> --actor <ログインID> [--apply] [--overwrite]
// CSV の見出し: employee_number,birth_date(3 列目以降は確認用で、読まない)。日付は YYYY-MM-DD か YYYY/MM/DD。
// --overwrite がなければ、すでに別の生年月日が入っている社員は「問題」として止める。
// CSV には個人情報が入るため、リポジトリの中に置かないこと。出力にも生年月日・氏名は出さない(社員番号と件数だけ)。
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { writeAuditLog } from "../src/modules/core/audit";
import { users } from "../src/modules/core/auth/schema";
import { normalizeText, parseCsv } from "../src/modules/core/employees/import";
import { employees } from "../src/modules/core/employees/schema";
import { isIsoDate } from "../src/modules/core/shared/date";
import { assertTarget } from "./guard";

const HEADER = "employee_number,birth_date";

/** `YYYY-MM-DD` / `YYYY/MM/DD`(月日は 1 桁も可)を `YYYY-MM-DD` に。正しくなければ null。 */
function normalizeBirthDate(value: string): string | null {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return isIsoDate(iso) && iso >= "1900-01-01" ? iso : null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const overwrite = argv.includes("--overwrite");
  const actorIndex = argv.indexOf("--actor");
  const actorLoginId = actorIndex >= 0 ? (argv[actorIndex + 1] ?? "").trim().toLowerCase() : "";
  const csvPath = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--actor");
  if (!csvPath || !actorLoginId) {
    throw new Error("使い方: npm run db:import-birth-dates -- <CSV のパス> --actor <ログインID> [--apply] [--overwrite]");
  }
  assertTarget("import-birth-dates");

  const rows = parseCsv(readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
  if ((rows[0] ?? []).slice(0, 2).map((h) => h.trim()).join(",") !== HEADER) {
    throw new Error(`見出しの最初の 2 列は ${HEADER} にしてください。`);
  }

  const [actor] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.loginId, actorLoginId));
  if (!actor || actor.status !== "active") throw new Error("--actor のアカウントが見つからないか、無効です。");

  const current = new Map((await db.select().from(employees)).map((e) => [e.employeeNumber, e]));
  const updates: { id: string; birthDate: string }[] = [];
  const problems: string[] = [];
  let unchanged = 0;
  let blank = 0;
  for (const [i, c] of rows.slice(1).entries()) {
    const line = i + 2;
    const number = normalizeText(c[0] ?? "");
    const raw = (c[1] ?? "").trim();
    if (!number && !raw) continue;
    if (!raw) {
      blank++;
      continue;
    }
    const birthDate = normalizeBirthDate(raw);
    const e = current.get(number);
    if (!e) problems.push(`${line} 行目: 社員番号 ${number} が見つかりません`);
    else if (!birthDate) problems.push(`${line} 行目: 社員番号 ${number} の生年月日の形が正しくありません`);
    else if (birthDate >= e.hiredOn) problems.push(`${line} 行目: 社員番号 ${number} の生年月日が入社日より後です`);
    else if (e.birthDate === birthDate) unchanged++;
    else if (e.birthDate !== null && !overwrite) {
      problems.push(`${line} 行目: 社員番号 ${number} には別の生年月日が入っています(上書きするなら --overwrite)`);
    } else updates.push({ id: e.id, birthDate });
  }

  console.log(
    `[birth-date] 登録する: ${updates.length} 件 / 変更なし: ${unchanged} 件 / 空欄: ${blank} 件 / 問題: ${problems.length} 件`,
  );
  for (const p of problems) console.log(`  - ${p}`);
  if (!apply) {
    console.log("[birth-date] 確認だけで終了しました(DB は変更していません)。書き込むには --apply を付けてください。");
    return;
  }
  if (problems.length > 0) throw new Error("問題のある行があるため、何も登録していません。");

  await db.transaction(async (tx) => {
    for (const u of updates) {
      await tx.update(employees).set({ birthDate: u.birthDate }).where(eq(employees.id, u.id));
      // 監査ログには、生年月日の値は残さない(どの社員の項目を変えたかだけ)。
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "employee.update",
        targetType: "employee",
        targetId: u.id,
        after: { fields: ["birthDate"], source: "import_birth_dates" },
      });
    }
  });
  console.log(`[birth-date] 登録しました: ${updates.length} 件`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
