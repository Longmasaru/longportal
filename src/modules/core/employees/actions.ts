"use server";

import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { requireGlobalPermission } from "../access";
import { writeAuditLog } from "../audit";
import { users } from "../auth/schema";
import { departments } from "../departments/schema";
import { locations } from "../locations/schema";
import { generateTempPassword, hashPassword } from "../auth/password";
import { clearLoginFailures } from "../auth/throttle";
import {
  PG_EXCLUSION_VIOLATION,
  PG_UNIQUE_VIOLATION,
  pgConstraintName,
  pgErrorCode,
} from "../shared/db-errors";
import { isIsoDate } from "../shared/date";
import { todayJst } from "../shared/jst";
import { evaluateEmployeeAccess } from "../access/evaluate";
import { LAST_SYSTEM_ADMIN_MESSAGE, isSoleActiveSystemAdmin } from "../roles/protection";
import { normalizeText } from "./import";
import { hasOpenPrimaryAssignment, planAssignmentChange, planTransfer } from "./logic";
import { employeeAssignments, employees } from "./schema";

// 社員管理の Server Action。すべて requireGlobalPermission("core.employees.manage") で本判定し、変更は監査ログと同じトランザクションで記録する。

export type EmployeeFormState = { error?: string; success?: string } | undefined;
export type AccountFormState =
  | { error?: string; success?: string; tempPassword?: string; loginId?: string }
  | undefined;

const uuid = z.uuid("選択内容が正しくありません。");
const isoDate = (label: string) =>
  z.string().refine(isIsoDate, `${label}は正しい日付(YYYY-MM-DD)で入力してください。`);
const optionalDate = (label: string) =>
  z
    .string()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || isIsoDate(v), `${label}は正しい日付で入力してください。`);
const optionalUuid = z.string().transform((v) => (v === "" ? null : v)).pipe(uuid.nullable());
/** 任意の短い文字(姓名など)。空白をそろえ(normalizeText)、空なら null。 */
const optionalText = (label: string) =>
  z
    .string()
    .transform((v) => normalizeText(v))
    .refine((v) => v.length <= 40, `${label}は40文字以内で入力してください。`)
    .transform((v) => (v === "" ? null : v));

const employeeSchema = z
  .object({
    employeeNumber: z
      .string()
      .trim()
      .min(1, "社員番号を入力してください。")
      .max(30, "社員番号は30文字以内で入力してください。"),
    // 氏名は姓と名で持つ(表示用の氏名 name は DB の生成列。docs/DESIGN.md 22 章)。
    familyName: z.string().transform(normalizeText).pipe(
      z.string().min(1, "姓を入力してください。").max(40, "姓は40文字以内で入力してください。"),
    ),
    givenName: optionalText("名"),
    familyNameKana: optionalText("姓(かな)"),
    givenNameKana: optionalText("名(かな)"),
    employmentTypeId: uuid,
    positionId: optionalUuid,
    hiredOn: isoDate("入社日"),
    leftOn: optionalDate("退職日(最終在籍日)"),
    birthDate: optionalDate("生年月日"),
    status: z.enum(["planned", "active", "leave", "retired"], "状態を選択してください。"),
  })
  .superRefine((v, ctx) => {
    if (v.birthDate !== null && (v.birthDate < "1900-01-01" || v.birthDate >= v.hiredOn)) {
      ctx.addIssue({ code: "custom", message: "生年月日を確かめてください(入社日より前の日付です)。" });
    }
    if (v.leftOn !== null && v.leftOn < v.hiredOn) {
      ctx.addIssue({ code: "custom", message: "退職日は入社日以降の日付にしてください。" });
    }
    if (v.status === "retired" && v.leftOn === null) {
      ctx.addIssue({ code: "custom", message: "状態を「退職」にするには、退職日(最終在籍日)が必要です。" });
    }
  });

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力内容を確認してください。";
}

function formObject(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
}

const initialAssignmentSchema = z.object({
  departmentId: z.string(),
  locationId: z.string(),
  startDate: z.string(),
});

// ---- 社員の登録・更新 ----------------------------------------------------------

export async function createEmployeeAction(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const actor = await requireGlobalPermission("core.employees.manage");
  const raw = formObject(formData);
  const parsed = employeeSchema.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  // 配属未確定でも登録できる。部署と拠点の両方を選んだ場合だけ、初期の主所属も作る。
  const init = initialAssignmentSchema.parse({
    departmentId: raw.departmentId ?? "",
    locationId: raw.locationId ?? "",
    startDate: raw.startDate || parsed.data.hiredOn,
  });
  const withAssignment = init.departmentId !== "" && init.locationId !== "";
  if ((init.departmentId !== "") !== (init.locationId !== "")) {
    return { error: "初期の所属を設定する場合は、部署と拠点の両方を選択してください。" };
  }
  if (withAssignment) {
    const check = z
      .object({ departmentId: uuid, locationId: uuid, startDate: isoDate("所属の開始日") })
      .safeParse(init);
    if (!check.success) return { error: firstIssue(check.error) };
  }

  let createdId: string;
  try {
    createdId = await db.transaction(async (tx) => {
      const [created] = await tx.insert(employees).values(parsed.data).returning();
      if (withAssignment) {
        await tx.insert(employeeAssignments).values({
          employeeId: created.id,
          departmentId: init.departmentId,
          locationId: init.locationId,
          startDate: init.startDate,
          isPrimary: true,
        });
      }
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "employee.create",
        targetType: "employee",
        targetId: created.id,
        after: { ...created, initialAssignment: withAssignment ? init : null },
      });
      return created.id;
    });
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) return { error: "この社員番号は既に使われています。" };
    throw err;
  }

  revalidatePath("/admin/employees");
  redirect(`/admin/employees/${createdId}`);
}

export async function updateEmployeeAction(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const actor = await requireGlobalPermission("core.employees.manage");
  const raw = formObject(formData);
  const id = raw.id ?? "";
  if (!uuid.safeParse(id).success) return { error: "不正なリクエストです。" };
  const parsed = employeeSchema.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const done = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(employees).where(eq(employees.id, id)).limit(1);
      if (!before) return false;

      // アクセスできる最後のシステム管理者が、この変更(退職・入社予定への変更など)でアクセス不可になる場合は拒否する。
      const [linkedUser] = await tx.select({ id: users.id }).from(users).where(eq(users.employeeId, id)).limit(1);
      if (linkedUser) {
        const today = todayJst();
        const wouldBeDenied = evaluateEmployeeAccess(parsed.data, today) !== null;
        if (wouldBeDenied && (await isSoleActiveSystemAdmin(tx, linkedUser.id, today))) {
          return LAST_SYSTEM_ADMIN_MESSAGE;
        }
      }

      const [after] = await tx.update(employees).set(parsed.data).where(eq(employees.id, id)).returning();
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "employee.update",
        targetType: "employee",
        targetId: id,
        before,
        after,
      });
      return true;
    });
    if (done === false) return { error: "社員が見つかりません。" };
    if (typeof done === "string") return { error: done };
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) return { error: "この社員番号は既に使われています。" };
    throw err;
  }

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  return { success: "保存しました。" };
}

// ---- 所属(異動) ----------------------------------------------------------------

const transferSchema = z.object({
  employeeId: uuid,
  departmentId: uuid,
  locationId: uuid,
  effectiveDate: isoDate("異動日(開始日)"),
});

/**
 * 主所属の設定・異動。異動日に有効な現在の主所属を前日で終了し、新しい主所属を異動日から始める
 * (1 トランザクション)。所属が無い場合は、新しい主所属を追加するだけ。
 * MVP では主所属のみを扱う(副所属の登録は画面にもサーバー側にも用意しない)。
 */
export async function transferAction(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const actor = await requireGlobalPermission("core.employees.manage");
  const parsed = transferSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { employeeId, departmentId, locationId, effectiveDate } = parsed.data;

  try {
    const error = await db.transaction(async (tx) => {
      const [emp] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId));
      if (!emp) return "社員が見つかりません。";

      const primaries = await tx
        .select()
        .from(employeeAssignments)
        .where(and(eq(employeeAssignments.employeeId, employeeId), eq(employeeAssignments.isPrimary, true)));
      const plan = planTransfer(primaries, effectiveDate);
      if (!plan.ok) return plan.error;

      if (plan.endCurrent) {
        await tx
          .update(employeeAssignments)
          .set({ endDate: plan.endCurrent.endDate })
          .where(eq(employeeAssignments.id, plan.endCurrent.id));
      }
      const [created] = await tx
        .insert(employeeAssignments)
        .values({ employeeId, departmentId, locationId, startDate: effectiveDate, isPrimary: true })
        .returning();
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "employee.transfer",
        targetType: "employee",
        targetId: employeeId,
        before: plan.endCurrent
          ? primaries.find((p) => p.id === plan.endCurrent!.id)
          : null,
        after: { endedPrevious: plan.endCurrent, created },
      });
      return null;
    });
    if (error) return { error };
  } catch (err) {
    if (pgErrorCode(err) === PG_EXCLUSION_VIOLATION) {
      return { error: "主所属の期間が他の所属と重複しています。日付を確認してください。" };
    }
    throw err;
  }

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  return { success: "所属を設定しました。" };
}

const endAssignmentSchema = z.object({
  assignmentId: uuid,
  endDate: isoDate("終了日"),
});

/** 所属の終了日を設定する(最終日を含む)。 */
export async function endAssignmentAction(
  _prev: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const actor = await requireGlobalPermission("core.employees.manage");
  const parsed = endAssignmentSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { assignmentId, endDate } = parsed.data;

  let employeeId: string | null = null;
  const error = await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(employeeAssignments)
      .where(eq(employeeAssignments.id, assignmentId))
      .limit(1);
    if (!before) return "所属が見つかりません。";
    employeeId = before.employeeId;
    if (endDate < before.startDate) return "終了日は開始日以降の日付にしてください。";
    const [after] = await tx
      .update(employeeAssignments)
      .set({ endDate })
      .where(eq(employeeAssignments.id, assignmentId))
      .returning();
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "employee.assignment.end",
      targetType: "employee",
      targetId: before.employeeId,
      before,
      after,
    });
    return null;
  });
  if (error) return { error };

  revalidatePath("/admin/employees");
  if (employeeId) revalidatePath(`/admin/employees/${employeeId}`);
  return { success: "所属を終了しました。" };
}

// ---- 所属の割り当て(一覧で部署・拠点をまとめて変更) --------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 1 人の主所属を、変更日から指定の部署・拠点にする(所属の割り当て画面と組織図のドラッグで共通)。
 * 変更日に始まった所属は付け直し、それより前からの所属は異動として扱う(planAssignmentChange)。監査ログも同じ tx で残す。
 * 部署も拠点も変わらなければ何もしない(changed: false)。
 */
async function applyPrimaryChange(
  tx: Tx,
  actorUserId: string,
  change: { employeeId: string; departmentId: string; locationId: string; effectiveDate: string },
): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  const { employeeId, departmentId, locationId, effectiveDate } = change;
  const primaries = await tx
    .select()
    .from(employeeAssignments)
    .where(and(eq(employeeAssignments.employeeId, employeeId), eq(employeeAssignments.isPrimary, true)));
  const covering = primaries.find(
    (p) => p.startDate <= effectiveDate && (p.endDate === null || p.endDate >= effectiveDate),
  );
  if (covering?.departmentId === departmentId && covering.locationId === locationId) return { ok: true, changed: false };

  const plan = planAssignmentChange(primaries, effectiveDate);
  if (!plan.ok) return plan;
  if (plan.kind === "correct") {
    const [after] = await tx
      .update(employeeAssignments)
      .set({ departmentId, locationId })
      .where(eq(employeeAssignments.id, plan.assignmentId))
      .returning();
    await writeAuditLog(tx, {
      actorUserId,
      action: "employee.assignment.update",
      targetType: "employee",
      targetId: employeeId,
      before: covering,
      after,
    });
  } else {
    await tx
      .update(employeeAssignments)
      .set({ endDate: plan.endCurrent.endDate })
      .where(eq(employeeAssignments.id, plan.endCurrent.id));
    const [created] = await tx
      .insert(employeeAssignments)
      .values({ employeeId, departmentId, locationId, startDate: effectiveDate, isPrimary: true })
      .returning();
    await writeAuditLog(tx, {
      actorUserId,
      action: "employee.transfer",
      targetType: "employee",
      targetId: employeeId,
      before: covering,
      after: { endedPrevious: plan.endCurrent, created },
    });
  }
  return { ok: true, changed: true };
}

export type AssignmentsFormState =
  | { error?: string; success?: string; failures?: { employeeId: string; message: string }[] }
  | undefined;

const DEPARTMENT_FIELD_PREFIX = "dept_";
const LOCATION_FIELD_PREFIX = "loc_";

/**
 * 所属の割り当て画面の保存。各社員の主所属の部署・拠点を、選ばれたものに変える。
 * 変更日に始まった所属は付け直し、それより前からの所属は異動として扱う(planAssignmentChange)。
 * 部署も拠点も変わらない社員は何もしない。全員を 1 トランザクションで処理し、1 人でも失敗したら何も変えない。
 */
export async function changeAssignmentsAction(
  _prev: AssignmentsFormState,
  formData: FormData,
): Promise<AssignmentsFormState> {
  const actor = await requireGlobalPermission("core.employees.manage");
  const raw = formObject(formData);
  const effectiveDate = raw.effectiveDate ?? "";
  if (!isIsoDate(effectiveDate)) return { error: "変更日は正しい日付で入力してください。" };

  const selections = Object.keys(raw)
    .filter((k) => k.startsWith(DEPARTMENT_FIELD_PREFIX))
    .map((k) => {
      const employeeId = k.slice(DEPARTMENT_FIELD_PREFIX.length);
      return {
        employeeId,
        departmentId: raw[k],
        locationId: raw[`${LOCATION_FIELD_PREFIX}${employeeId}`] ?? "",
      };
    });
  if (
    selections.some(
      (s) =>
        !uuid.safeParse(s.employeeId).success ||
        !uuid.safeParse(s.departmentId).success ||
        !uuid.safeParse(s.locationId).success,
    )
  ) {
    return { error: "不正なリクエストです。" };
  }

  const [activeDepartmentIds, activeLocationIds] = await Promise.all([
    db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.isActive, true))
      .then((rows) => new Set(rows.map((r) => r.id))),
    db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.isActive, true))
      .then((rows) => new Set(rows.map((r) => r.id))),
  ]);
  if (
    selections.some((s) => !activeDepartmentIds.has(s.departmentId) || !activeLocationIds.has(s.locationId))
  ) {
    return { error: "選べない部署・拠点が含まれています。画面を読み込み直してください。" };
  }

  const failures: { employeeId: string; message: string }[] = [];
  let changed = 0;
  try {
    await db.transaction(async (tx) => {
      for (const { employeeId, departmentId, locationId } of selections) {
        const result = await applyPrimaryChange(tx, actor.userId, { employeeId, departmentId, locationId, effectiveDate });
        if (!result.ok) {
          failures.push({ employeeId, message: result.error });
          continue;
        }
        if (!result.changed) continue;
        changed++;
      }
      // 1 人でも失敗したら、全員分を取り消す(一部だけ変わった状態を残さない)。
      if (failures.length > 0) tx.rollback();
    });
  } catch (err) {
    if (failures.length > 0) {
      return { error: `${failures.length}名の所属を変更できませんでした。何も変更していません。`, failures };
    }
    if (pgErrorCode(err) === PG_EXCLUSION_VIOLATION) {
      return { error: "主所属の期間が他の所属と重複しています。何も変更していません。" };
    }
    throw err;
  }

  revalidatePath("/admin/employees");
  revalidatePath("/admin/employees/assignments");
  return {
    success: changed === 0 ? "変更はありませんでした。" : `${changed}名の所属を変更しました。`,
  };
}

// ---- 組織図のドラッグ(1 人の部署だけを変える) ------------------------------------

export type MoveDepartmentResult = { error?: string; success?: string };

const moveDepartmentSchema = z.object({
  employeeId: uuid,
  departmentId: uuid,
  effectiveDate: isoDate("異動日"),
});

/**
 * 組織図で札を別の部署の箱へ落としたときの保存。拠点は今の主所属のまま、部署だけを変更日から変える。
 * 所属の割り当て画面と同じ規則(applyPrimaryChange)で、権限も同じ core.employees.manage(全社)。
 */
export async function moveEmployeeDepartmentAction(input: {
  employeeId: string;
  departmentId: string;
  effectiveDate: string;
}): Promise<MoveDepartmentResult> {
  const actor = await requireGlobalPermission("core.employees.manage");
  const parsed = moveDepartmentSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { employeeId, departmentId, effectiveDate } = parsed.data;

  const [dept] = await db
    .select({ id: departments.id })
    .from(departments)
    .where(and(eq(departments.id, departmentId), eq(departments.isActive, true)));
  if (!dept) return { error: "選べない部署です。画面を読み込み直してください。" };

  try {
    const error = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ locationId: employeeAssignments.locationId })
        .from(employeeAssignments)
        .where(
          and(
            eq(employeeAssignments.employeeId, employeeId),
            eq(employeeAssignments.isPrimary, true),
            lte(employeeAssignments.startDate, effectiveDate),
            or(isNull(employeeAssignments.endDate), gte(employeeAssignments.endDate, effectiveDate)),
          ),
        );
      if (!current) return "異動日に有効な所属がありません。社員の画面で所属を設定してください。";
      const result = await applyPrimaryChange(tx, actor.userId, {
        employeeId,
        departmentId,
        locationId: current.locationId,
        effectiveDate,
      });
      return result.ok ? null : result.error;
    });
    if (error) return { error };
  } catch (err) {
    if (pgErrorCode(err) === PG_EXCLUSION_VIOLATION) {
      return { error: "主所属の期間が他の所属と重複しています。日付を確認してください。" };
    }
    throw err;
  }

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin/employees/assignments");
  revalidatePath("/apps/soshikizu");
  return { success: "所属を変更しました。" };
}

// ---- ログインアカウント --------------------------------------------------------
// 初期(一時)パスワードは generateTempPassword で作り、画面に 1 度だけ表示する。

const issueAccountSchema = z.object({
  employeeId: uuid,
  loginId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,50}$/, "ログインIDは半角英数字と . _ - で3〜50文字にしてください。"),
});

/**
 * 社員にログインアカウントを発行する。有効な主所属(終了していないもの。開始日が未来でも可)が必要。
 * 入社前でもアカウントは準備できるが、実際に使えるかはアクセス判定(状態・入社日・退職日)が決める。
 */
export async function issueAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const actor = await requireGlobalPermission("core.employees.manage");
  const parsed = issueAccountSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { employeeId, loginId } = parsed.data;
  const today = todayJst();
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  try {
    const error = await db.transaction(async (tx) => {
      const [emp] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId));
      if (!emp) return "社員が見つかりません。";
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.employeeId, employeeId));
      if (existing) return "この社員には既にアカウントがあります。";
      const assignments = await tx
        .select({ isPrimary: employeeAssignments.isPrimary, endDate: employeeAssignments.endDate })
        .from(employeeAssignments)
        .where(eq(employeeAssignments.employeeId, employeeId));
      if (!hasOpenPrimaryAssignment(assignments, today)) {
        return "アカウントを発行するには、終了していない主所属が必要です。先に所属を設定してください。";
      }
      const [created] = await tx
        .insert(users)
        .values({ loginId, passwordHash, employeeId, status: "active", mustChangePassword: true })
        .returning();
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        action: "user.create",
        targetType: "user",
        targetId: created.id,
        after: { loginId, employeeId, status: "active" },
      });
      return null;
    });
    if (error) return { error };
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION && pgConstraintName(err)?.includes("login_id")) {
      return { error: "このログインIDは既に使われています。" };
    }
    throw err;
  }

  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin/employees");
  return { success: "アカウントを発行しました。", tempPassword, loginId };
}

const userStatusSchema = z.object({
  userId: uuid,
  status: z.enum(["active", "disabled"]),
});

/** アカウントの有効化・無効化。無効化は次のアクセス判定から即時に反映される。 */
export async function setUserStatusAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const actor = await requireGlobalPermission("core.employees.manage");
  const parsed = userStatusSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { userId, status } = parsed.data;
  if (userId === actor.userId && status === "disabled") {
    return { error: "自分自身のアカウントは無効化できません。" };
  }
  const today = todayJst();

  let employeeId: string | null = null;
  const error = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!before) return "アカウントが見つかりません。";
    employeeId = before.employeeId;
    if (status === "active" && before.employeeId) {
      const assignments = await tx
        .select({ isPrimary: employeeAssignments.isPrimary, endDate: employeeAssignments.endDate })
        .from(employeeAssignments)
        .where(inArray(employeeAssignments.employeeId, [before.employeeId]));
      if (!hasOpenPrimaryAssignment(assignments, today)) {
        return "有効化するには、終了していない主所属が必要です。先に所属を設定してください。";
      }
    }
    if (status === "disabled" && (await isSoleActiveSystemAdmin(tx, userId, today))) {
      return LAST_SYSTEM_ADMIN_MESSAGE;
    }
    await tx.update(users).set({ status }).where(eq(users.id, userId));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: status === "active" ? "user.enable" : "user.disable",
      targetType: "user",
      targetId: userId,
      before: { status: before.status },
      after: { status },
    });
    return null;
  });
  if (error) return { error };

  if (employeeId) revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin/employees");
  return { success: status === "active" ? "アカウントを有効にしました。" : "アカウントを無効にしました。" };
}

const resetPasswordSchema = z.object({ userId: uuid });

/** パスワードの再設定。新しい一時パスワードを発行し、次回ログイン時に変更を必須にする。 */
export async function resetPasswordAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const actor = await requireGlobalPermission("core.employees.manage");
  const parsed = resetPasswordSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { userId } = parsed.data;
  if (userId === actor.userId) {
    return { error: "自分自身のパスワードは、ユーザーメニューの「パスワードを変更」から変更してください。" };
  }
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  let employeeId: string | null = null;
  let loginId = "";
  const error = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!before) return "アカウントが見つかりません。";
    employeeId = before.employeeId;
    loginId = before.loginId;
    await tx.update(users).set({ passwordHash, mustChangePassword: true }).where(eq(users.id, userId));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "user.password_reset",
      targetType: "user",
      targetId: userId,
      after: { mustChangePassword: true },
    });
    return null;
  });
  if (error) return { error };

  // 失敗の記録によるロックが残っていると、再設定した本人がすぐにログインできないため、解除する。
  await clearLoginFailures(loginId);

  if (employeeId) revalidatePath(`/admin/employees/${employeeId}`);
  return { success: "パスワードを再設定しました。", tempPassword, loginId };
}
