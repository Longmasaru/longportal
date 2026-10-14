"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { requireGlobalPermission } from "../access";
import { writeAuditLog } from "../audit";
import { users } from "../auth/schema";
import { hashPassword } from "../auth/password";
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
import { hasOpenPrimaryAssignment, planTransfer } from "./logic";
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

const employeeSchema = z
  .object({
    employeeNumber: z
      .string()
      .trim()
      .min(1, "社員番号を入力してください。")
      .max(30, "社員番号は30文字以内で入力してください。"),
    name: z.string().trim().min(1, "氏名を入力してください。").max(50),
    nameKana: z.string().trim().max(50).transform((v) => (v === "" ? null : v)),
    employmentTypeId: uuid,
    positionId: optionalUuid,
    hiredOn: isoDate("入社日"),
    leftOn: optionalDate("退職日(最終在籍日)"),
    status: z.enum(["planned", "active", "leave", "retired"], "状態を選択してください。"),
  })
  .superRefine((v, ctx) => {
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

// ---- ログインアカウント --------------------------------------------------------

/** 初期(一時)パスワード。読み間違えにくい文字だけで 12 文字。画面に 1 度だけ表示する。 */
function generateTempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

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
