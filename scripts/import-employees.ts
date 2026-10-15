// 社員の一括取り込み(CSV)。新しい社員番号だけを追加し、登録済みの社員の情報は変更しない。
// 部署・役職の名前がマスタにない場合は、マスタにも追加する。
// --assign-location を付けると、主所属がまだない社員(今回追加する社員を含む)に、
// CSV の部署 × 指定の拠点で主所属を作る(拠点はあとで「拠点の割り当て」画面で選び直す。docs/DESIGN.md 21 章)。
//
// 実行(既定は確認だけで、DB に書き込まない):
//   npm run db:import-employees -- <CSV のパス> --actor <ログインID>
//   npm run db:import-employees -- <CSV のパス> --actor <ログインID> --apply
// オプション:
//   --employment-type <雇用区分の code>(既定 regular = 正社員)
//   --assign-location <拠点名>(主所属を作る拠点。拠点マスタに登録済みであること)
//   --start <YYYY-MM-DD>(作る主所属の開始日。既定は今日)
//
// CSV の見出し: employee_number,name,name_kana,position,department,hired_on
// CSV には個人情報が入るため、リポジトリの中に置かないこと。出力にも社員の氏名は出さない。
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq, max } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { writeAuditLog } from "../src/modules/core/audit";
import { users } from "../src/modules/core/auth/schema";
import { departments } from "../src/modules/core/departments/schema";
import { readImportCsv } from "../src/modules/core/employees/import";
import { employeeAssignments, employees } from "../src/modules/core/employees/schema";
import { employmentTypes } from "../src/modules/core/employment-types/schema";
import { locations } from "../src/modules/core/locations/schema";
import { positions } from "../src/modules/core/positions/schema";
import { isIsoDate } from "../src/modules/core/shared/date";
import { todayJst } from "../src/modules/core/shared/jst";
import { assertTarget } from "./guard";

type Args = {
  csvPath: string;
  actorLoginId: string;
  apply: boolean;
  employmentTypeCode: string;
  assignLocation: string | null;
  startDate: string | null;
};

function parseArgs(argv: string[]): Args {
  const rest: string[] = [];
  const args: Omit<Args, "csvPath"> = {
    actorLoginId: "",
    apply: false,
    employmentTypeCode: "regular",
    assignLocation: null,
    startDate: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--actor") args.actorLoginId = (argv[++i] ?? "").trim().toLowerCase();
    else if (a === "--employment-type") args.employmentTypeCode = argv[++i] ?? "";
    else if (a === "--assign-location") args.assignLocation = (argv[++i] ?? "").trim();
    else if (a === "--start") args.startDate = argv[++i] ?? "";
    else rest.push(a);
  }
  if (rest.length !== 1 || !args.actorLoginId) {
    throw new Error("使い方: npm run db:import-employees -- <CSV のパス> --actor <ログインID> [--assign-location <拠点名>] [--apply]");
  }
  if (args.startDate !== null && !isIsoDate(args.startDate)) throw new Error("--start は YYYY-MM-DD で指定してください。");
  return { csvPath: rest[0], ...args };
}

/** 名前から決まるマスタの code(同じ名前なら同じ code。半角英数字の規則を満たす)。 */
function masterCode(prefix: string, name: string): string {
  return `${prefix}_${createHash("sha256").update(name).digest("hex").slice(0, 8)}`;
}

/** 記録の中の名前(重複なし・出現順)。 */
function uniqueNames(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== null))];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertTarget("import-employees");
  const today = todayJst();
  const startDate = args.startDate ?? today;

  const { records, issues } = readImportCsv(readFileSync(args.csvPath, "utf8"));
  console.log(`[import] CSV: 取り込める行 ${records.length} 件 / 問題のある行 ${issues.length} 件`);
  for (const issue of issues) console.log(`  - ${issue.line} 行目: ${issue.message}`);
  if (issues.some((i) => i.line === 1)) return;

  const [actor] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.loginId, args.actorLoginId));
  if (!actor || actor.status !== "active") throw new Error("--actor のアカウントが見つからないか、無効です。");

  const [employmentType] = await db
    .select()
    .from(employmentTypes)
    .where(eq(employmentTypes.code, args.employmentTypeCode));
  if (!employmentType) throw new Error(`雇用区分 ${args.employmentTypeCode} が見つかりません。`);

  let location: { id: string; name: string } | null = null;
  if (args.assignLocation !== null) {
    [location] = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(and(eq(locations.name, args.assignLocation), eq(locations.isActive, true)));
    if (!location) throw new Error(`拠点「${args.assignLocation}」が拠点マスタにありません(有効なもの)。`);
  }

  const existingEmployees = await db
    .select({ id: employees.id, number: employees.employeeNumber })
    .from(employees);
  const existingNumbers = new Set(existingEmployees.map((e) => e.number));
  const withPrimary = new Set(
    (
      await db
        .select({ employeeId: employeeAssignments.employeeId })
        .from(employeeAssignments)
        .where(eq(employeeAssignments.isPrimary, true))
    ).map((a) => a.employeeId),
  );
  const idByNumber = new Map(existingEmployees.map((e) => [e.number, e.id]));

  const newRecords = records.filter((r) => !existingNumbers.has(r.employeeNumber));
  const skipped = records.length - newRecords.length;
  // 主所属を作る対象: 主所属が 1 件もない社員(今回追加する社員を含む)。部署が空の社員は作れない。
  const needsAssignment = location
    ? records.filter((r) => {
        const id = idByNumber.get(r.employeeNumber);
        return id === undefined || !withPrimary.has(id);
      })
    : [];
  const assignTargets = needsAssignment.filter((r) => r.departmentName !== null);

  const existingDepartments = await db.select().from(departments);
  const existingPositions = await db.select().from(positions);
  const newDepartmentNames = uniqueNames(
    [...newRecords, ...assignTargets].map((r) => r.departmentName),
  ).filter((n) => !existingDepartments.some((d) => d.name === n));
  const newPositionNames = uniqueNames(newRecords.map((r) => r.positionName)).filter(
    (n) => !existingPositions.some((p) => p.name === n),
  );
  const planned = newRecords.filter((r) => r.hiredOn > today).length;

  console.log(`[import] 追加する社員: ${newRecords.length} 件(入社予定 ${planned} 件) / 登録済みのため飛ばす: ${skipped} 件`);
  console.log(`[import] 雇用区分: ${employmentType.name}(追加する社員全員に設定。違う人は画面で直す)`);
  console.log(`[import] 追加する部署: ${newDepartmentNames.join("、") || "なし"}`);
  console.log(`[import] 追加する役職: ${newPositionNames.join("、") || "なし"}`);
  if (location) {
    console.log(
      `[import] 主所属を作る: ${assignTargets.length} 件(拠点 ${location.name}、開始日 ${startDate}) / 部署が空のため作れない: ${needsAssignment.length - assignTargets.length} 件`,
    );
  } else {
    console.log("[import] 主所属は作りません(作るには --assign-location <拠点名>)。");
  }

  if (!args.apply) {
    console.log("[import] 確認だけで終了しました(DB は変更していません)。書き込むには --apply を付けてください。");
    return;
  }

  await db.transaction(async (tx) => {
    const [{ deptOrder }] = await tx.select({ deptOrder: max(departments.sortOrder) }).from(departments);
    const [{ posOrder }] = await tx.select({ posOrder: max(positions.sortOrder) }).from(positions);

    for (const [i, name] of newDepartmentNames.entries()) {
      const [created] = await tx
        .insert(departments)
        .values({ code: masterCode("dept", name), name, sortOrder: (deptOrder ?? 0) + (i + 1) * 10 })
        .returning();
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "master.create",
        targetType: "departments",
        targetId: created.id,
        after: { ...created, source: "csv_import" },
      });
    }
    for (const [i, name] of newPositionNames.entries()) {
      const [created] = await tx
        .insert(positions)
        .values({ code: masterCode("pos", name), name, sortOrder: (posOrder ?? 0) + (i + 1) * 10 })
        .returning();
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "master.create",
        targetType: "positions",
        targetId: created.id,
        after: { ...created, source: "csv_import" },
      });
    }

    const positionIdByName = new Map(
      (await tx.select({ id: positions.id, name: positions.name }).from(positions)).map((p) => [p.name, p.id]),
    );

    for (const r of newRecords) {
      const [created] = await tx
        .insert(employees)
        .values({
          employeeNumber: r.employeeNumber,
          name: r.name,
          nameKana: r.nameKana,
          employmentTypeId: employmentType.id,
          positionId: r.positionName ? (positionIdByName.get(r.positionName) ?? null) : null,
          hiredOn: r.hiredOn,
          status: r.hiredOn > today ? "planned" : "active",
        })
        .returning();
      idByNumber.set(created.employeeNumber, created.id);
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "employee.create",
        targetType: "employee",
        targetId: created.id,
        after: { ...created, source: "csv_import", departmentName: r.departmentName },
      });
    }

    if (location) {
      const departmentIdByName = new Map(
        (await tx.select({ id: departments.id, name: departments.name }).from(departments)).map((d) => [
          d.name,
          d.id,
        ]),
      );
      for (const r of assignTargets) {
        const employeeId = idByNumber.get(r.employeeNumber)!;
        const [created] = await tx
          .insert(employeeAssignments)
          .values({
            employeeId,
            departmentId: departmentIdByName.get(r.departmentName!)!,
            locationId: location.id,
            startDate,
            isPrimary: true,
          })
          .returning();
        await writeAuditLog(tx, {
          actorUserId: actor.id,
          action: "employee.transfer",
          targetType: "employee",
          targetId: employeeId,
          after: { endedPrevious: null, created, source: "csv_import" },
        });
      }
    }
  });

  console.log(
    `[import] 書き込みました: 社員 ${newRecords.length} 件、部署 ${newDepartmentNames.length} 件、役職 ${newPositionNames.length} 件、主所属 ${assignTargets.length} 件`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
