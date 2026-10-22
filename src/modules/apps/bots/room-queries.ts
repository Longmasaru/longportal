import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/modules/core/auth/schema";
import { departments } from "@/modules/core/departments/schema";
import { employeeAssignments, employees } from "@/modules/core/employees/schema";
import { isOnRoster, type RoomCandidate } from "./rooms";

// 送り先の部屋に入れる社員の読み取り(docs/DESIGN.md 40 章)。在籍中の社員だけ。部署は今日の主所属。

function rosterQuery(today: string) {
  return db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      familyName: employees.familyName,
      givenName: employees.givenName,
      familyNameKana: employees.familyNameKana,
      givenNameKana: employees.givenNameKana,
      hiredOn: employees.hiredOn,
      leftOn: employees.leftOn,
      status: employees.status,
      email: users.email,
      department: departments.name,
    })
    .from(employees)
    .leftJoin(users, eq(users.employeeId, employees.id))
    .leftJoin(
      employeeAssignments,
      and(
        eq(employeeAssignments.employeeId, employees.id),
        eq(employeeAssignments.isPrimary, true),
        lte(employeeAssignments.startDate, today),
        or(isNull(employeeAssignments.endDate), gte(employeeAssignments.endDate, today)),
      ),
    )
    .leftJoin(departments, eq(departments.id, employeeAssignments.departmentId))
    .$dynamic();
}

type RosterRow = Awaited<ReturnType<typeof rosterQuery>>[number];

function fullName(r: RosterRow): string {
  return `${r.familyName} ${r.givenName ?? ""}`.trim();
}

/** 部屋に入れる候補(在籍中の社員。社員番号の順)。 */
export async function listRoomCandidates(today: string): Promise<RoomCandidate[]> {
  const rows = await rosterQuery(today).where(inArray(employees.status, ["active", "leave"])).orderBy(asc(employees.employeeNumber));
  return rows
    .filter((r) => isOnRoster(r, today))
    .map((r) => ({
      id: r.id,
      employeeNumber: r.employeeNumber,
      name: fullName(r),
      kana: `${r.familyNameKana ?? ""}${r.givenNameKana ?? ""}`,
      department: r.department ?? "",
    }));
}

/** 選ばれた社員(在籍中の人だけ)。LINE WORKS との突き合わせに使う氏名・フリガナ・メールつき。 */
export async function loadRoomEmployees(ids: string[], today: string) {
  const rows = await rosterQuery(today).where(inArray(employees.id, ids));
  return rows.filter((r) => isOnRoster(r, today)).map((r) => ({ ...r, name: fullName(r) }));
}
