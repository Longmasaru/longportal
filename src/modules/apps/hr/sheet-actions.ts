"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { writeAuditLog } from "@/modules/core/audit";
import { employees } from "@/modules/core/employees/schema";
import { isIsoDate } from "@/modules/core/shared/date";
import { DENIED, managerFor } from "./guard";
import {
  ABILITY_AXES,
  CONDITION_STATES,
  GENDERS,
  NAME_MAX,
  PROFILE_TEXT_FIELDS,
  TEXT_MAX,
  TRAINING_KINDS,
} from "./labels";
import { wouldCreateCycle } from "./logic";
import { manifest } from "./manifest";
import { getSupervisorMap } from "./queries";
import { hrAbilities, hrConditionChecks, hrProfiles, hrQualifications, hrSkills, hrTrainings } from "./schema";
import type { RecordFormState } from "./types";

// 人事管理シート(1〜5 章)の Server Action。docs/DESIGN.md 31.1。
// 毎回、対象の社員を管理できるか(managerFor)を判定する。本人・上司は書けない。監査ログには項目名(と上司の社員 ID)だけを残す。

const idSchema = z.uuid();

/** 空欄は null。 */
const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || isIsoDate(v), "日付が正しくありません。")
  .transform((v) => (v === "" ? null : v));

const optionalNumber = (label: string, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+(\.\d)?$/.test(v) && Number(v) <= max), `${label}は 0〜${max} の数字(小数は 1 桁まで)で入力してください。`)
    .transform((v) => (v === "" ? null : Number(v)));

const text = (label: string) =>
  z.string().trim().max(TEXT_MAX, `${label}は${TEXT_MAX}文字以内で入力してください。`);

const SECTION_SCHEMAS = {
  basic: z.object({
    birthDate: optionalDate,
    gender: z.union([z.enum(GENDERS), z.literal("")]).transform((v) => (v === "" ? null : v)),
    remoteRatio: z
      .string()
      .trim()
      .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) <= 100), "在宅勤務比率は 0〜100 で入力してください。")
      .transform((v) => (v === "" ? null : Number(v))),
    supervisorEmployeeId: z.union([z.uuid("上司を選び直してください。"), z.literal("")]).transform((v) => (v === "" ? null : v)),
  }),
  goals: z.object(Object.fromEntries(PROFILE_TEXT_FIELDS.goals.map((f) => [f.key, text(f.label)]))),
  skills: z.object(Object.fromEntries(PROFILE_TEXT_FIELDS.skills.map((f) => [f.key, text(f.label)]))),
  character: z.object(Object.fromEntries(PROFILE_TEXT_FIELDS.character.map((f) => [f.key, text(f.label)]))),
  condition: z.object({
    overtimeHours: optionalNumber("月平均残業時間", 999),
    leaveGranted: optionalNumber("付与日数", 99),
    leaveTaken: optionalNumber("取得日数", 99),
    leaveAsOf: optionalDate,
  }),
} as const;

type SectionKey = keyof typeof SECTION_SCHEMAS;

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力内容を確認してください。";
}

function formObject(formData: FormData, keys: readonly string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

/** 1 つの章の項目をまとめて保存する(行がなければ作る)。 */
export async function saveSectionAction(_prev: RecordFormState, formData: FormData): Promise<RecordFormState> {
  const employeeId = idSchema.safeParse(formData.get("employeeId"));
  const section = String(formData.get("section") ?? "");
  if (!employeeId.success || !(section in SECTION_SCHEMAS)) return { error: "不正なリクエストです。" };
  const schema = SECTION_SCHEMAS[section as SectionKey];
  const actor = await managerFor(employeeId.data);
  if (!actor) return { error: DENIED };
  const parsed = schema.safeParse(formObject(formData, Object.keys(schema.shape)));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const values = parsed.data as Record<string, unknown>;
  if (
    section === "condition" &&
    values.leaveGranted !== null &&
    values.leaveTaken !== null &&
    (values.leaveTaken as number) > (values.leaveGranted as number)
  ) {
    return { error: "取得日数が付与日数より多くなっています。" };
  }
  if (section === "basic" && values.supervisorEmployeeId) {
    const supervisorId = values.supervisorEmployeeId as string;
    const [candidate] = await db
      .select({ status: employees.status })
      .from(employees)
      .where(eq(employees.id, supervisorId))
      .limit(1);
    if (!candidate || candidate.status === "retired") return { error: "上司に選べない社員です。" };
    if (wouldCreateCycle(employeeId.data, supervisorId, await getSupervisorMap())) {
      return { error: "本人や、本人の部下は上司に選べません。" };
    }
  }

  // 生年月日は社員マスタ(core.employees)に持つ。docs/DESIGN.md 37 章。
  const { birthDate, ...profileValues } = values;
  await db.transaction(async (tx) => {
    if (section === "basic") {
      await tx.update(employees).set({ birthDate: birthDate as string | null }).where(eq(employees.id, employeeId.data));
    }
    await tx
      .insert(hrProfiles)
      .values({ employeeId: employeeId.data, ...profileValues, updatedBy: actor.userId })
      .onConflictDoUpdate({ target: hrProfiles.employeeId, set: { ...profileValues, updatedBy: actor.userId } });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "hr.profile.update",
      targetType: "hr_profile",
      targetId: employeeId.data,
      after: {
        section,
        fields: Object.keys(values),
        ...(section === "basic" ? { supervisorEmployeeId: values.supervisorEmployeeId } : {}),
      },
    });
  });
  revalidatePath(manifest.route, "layout");
  return { ok: Date.now() };
}

const ITEM_SCHEMAS = {
  qualification: z.object({
    name: z.string().trim().min(1, "資格・免許の名前を入力してください。").max(NAME_MAX, `名前は${NAME_MAX}文字以内で入力してください。`),
    acquiredOn: optionalDate,
    expiresOn: optionalDate,
  }),
  skill: z.object({
    name: z.string().trim().min(1, "スキルの名前を入力してください。").max(NAME_MAX, `名前は${NAME_MAX}文字以内で入力してください。`),
    level: z.coerce.number().int().min(1, "評価は 1〜5 で選んでください。").max(5, "評価は 1〜5 で選んでください。"),
  }),
  training: z.object({
    kind: z.enum(TRAINING_KINDS, "社内・社外を選んでください。"),
    title: z.string().trim().min(1, "研修の内容を入力してください。").max(NAME_MAX, `内容は${NAME_MAX}文字以内で入力してください。`),
    takenOn: optionalDate,
  }),
  condition: z.object({
    checkedOn: z.string().trim().refine(isIsoDate, "確認した日を入力してください。"),
    health: z.union([z.enum(CONDITION_STATES), z.literal("")]).transform((v) => (v === "" ? null : v)),
    mental: z.union([z.enum(CONDITION_STATES), z.literal("")]).transform((v) => (v === "" ? null : v)),
    satisfaction: z
      .string()
      .refine((v) => v === "" || /^[1-5]$/.test(v), "満足度を選んでください。")
      .transform((v) => (v === "" ? null : Number(v))),
    note: z.string().trim().max(TEXT_MAX, `メモは${TEXT_MAX}文字以内で入力してください。`),
  }),
} as const;

type ItemType = keyof typeof ITEM_SCHEMAS;

const ITEM_TABLES = {
  qualification: hrQualifications,
  skill: hrSkills,
  training: hrTrainings,
  condition: hrConditionChecks,
} as const;

function itemType(value: FormDataEntryValue | null): ItemType | null {
  const v = String(value ?? "");
  return v in ITEM_SCHEMAS ? (v as ItemType) : null;
}

/** 一覧(資格・スキル・研修・コンディションの確認)に 1 行足す。 */
export async function addItemAction(_prev: RecordFormState, formData: FormData): Promise<RecordFormState> {
  const employeeId = idSchema.safeParse(formData.get("employeeId"));
  const type = itemType(formData.get("type"));
  if (!employeeId.success || !type) return { error: "不正なリクエストです。" };
  const actor = await managerFor(employeeId.data);
  if (!actor) return { error: DENIED };
  const schema = ITEM_SCHEMAS[type];
  const parsed = schema.safeParse(formObject(formData, Object.keys(schema.shape)));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const data = parsed.data as Record<string, unknown>;
  if (type === "condition" && data.health === null && data.mental === null && data.satisfaction === null) {
    return { error: "健康状態・メンタル面・満足度のどれかを選んでください。" };
  }

  await db.transaction(async (tx) => {
    const values = {
      employeeId: employeeId.data,
      ...data,
      ...(type === "condition" ? { authorUserId: actor.userId } : {}),
    };
    // テーブルごとに列が違うため、ここでは型を緩める(値は上の zod で検証済み)。
    const [row] = await tx
      .insert(ITEM_TABLES[type])
      .values(values as never)
      .returning({ id: ITEM_TABLES[type].id });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "hr.item.create",
      targetType: `hr_${type}`,
      targetId: row.id,
      after: { employeeId: employeeId.data, type },
    });
  });
  revalidatePath(manifest.route, "layout");
  return { ok: Date.now() };
}

/** 一覧の行を消す。 */
export async function deleteItemAction(_prev: RecordFormState, formData: FormData): Promise<RecordFormState> {
  const id = idSchema.safeParse(formData.get("id"));
  const type = itemType(formData.get("type"));
  if (!id.success || !type) return { error: "不正なリクエストです。" };
  const table = ITEM_TABLES[type];
  const [current] = await db.select({ employeeId: table.employeeId }).from(table).where(eq(table.id, id.data)).limit(1);
  if (!current) return { ok: Date.now() };
  const actor = await managerFor(current.employeeId);
  if (!actor) return { error: DENIED };

  await db.transaction(async (tx) => {
    await tx.delete(table).where(and(eq(table.id, id.data), eq(table.employeeId, current.employeeId)));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "hr.item.delete",
      targetType: `hr_${type}`,
      targetId: id.data,
      before: { employeeId: current.employeeId, type },
    });
  });
  revalidatePath(manifest.route, "layout");
  return { ok: Date.now() };
}

const levelOrEmpty = z
  .string()
  .refine((v) => v === "" || /^[1-5]$/.test(v), "評価は 1〜5 で選んでください。")
  .transform((v) => (v === "" ? null : Number(v)));

/** 能力の 5 項目をまとめて保存する(空欄の項目は行を消す)。31.2。 */
export async function saveAbilitiesAction(_prev: RecordFormState, formData: FormData): Promise<RecordFormState> {
  const employeeId = idSchema.safeParse(formData.get("employeeId"));
  if (!employeeId.success) return { error: "不正なリクエストです。" };
  const actor = await managerFor(employeeId.data);
  if (!actor) return { error: DENIED };
  const levels: { axis: (typeof ABILITY_AXES)[number]["key"]; level: number | null }[] = [];
  for (const a of ABILITY_AXES) {
    const parsed = levelOrEmpty.safeParse(String(formData.get(a.key) ?? ""));
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    levels.push({ axis: a.key, level: parsed.data });
  }
  const set = levels.filter((l): l is { axis: (typeof l)["axis"]; level: number } => l.level !== null);
  const cleared = levels.filter((l) => l.level === null).map((l) => l.axis);

  await db.transaction(async (tx) => {
    if (cleared.length > 0) {
      await tx.delete(hrAbilities).where(and(eq(hrAbilities.employeeId, employeeId.data), inArray(hrAbilities.axis, cleared)));
    }
    for (const l of set) {
      await tx
        .insert(hrAbilities)
        .values({ employeeId: employeeId.data, axis: l.axis, level: l.level, updatedBy: actor.userId })
        .onConflictDoUpdate({
          target: [hrAbilities.employeeId, hrAbilities.axis],
          set: { level: l.level, updatedBy: actor.userId, updatedAt: new Date() },
        });
    }
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "hr.ability.update",
      targetType: "hr_abilities",
      targetId: employeeId.data,
      after: { set: set.map((l) => l.axis), cleared },
    });
  });
  revalidatePath(manifest.route, "layout");
  return { ok: Date.now() };
}
