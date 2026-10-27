"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAppAccess } from "@/modules/core/apps";
import { writeAuditLog } from "@/modules/core/audit";
import { employees } from "@/modules/core/employees/schema";
import { FLOOR_MAP_SIZE, areaAt } from "./floor-map";
import { isOnRoster } from "./logic";
import { manifest } from "./manifest";
import { soshikizuSeatPositions } from "./schema";

// 配置図の札を動かす・元に戻す(docs/DESIGN.md 36 章)。組織図を見られる社員はだれでも、だれの札でも動かせる(ユーザーの判断)。
// 場所(どの建物か)は、送られた座標からサーバー側で決める。変更は監査ログに残す。

export type SeatActionResult = { error?: string };

const MAP_ROUTE = `${manifest.route}/haichi`;

const moveSchema = z.object({
  employeeId: z.uuid(),
  x: z.number().finite().min(0).max(FLOOR_MAP_SIZE.width),
  y: z.number().finite().min(0).max(FLOOR_MAP_SIZE.height),
});

async function onRoster(employeeId: string, today: string): Promise<boolean> {
  const [e] = await db
    .select({ hiredOn: employees.hiredOn, leftOn: employees.leftOn, status: employees.status })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return !!e && isOnRoster(e, today);
}

export async function moveSeatAction(input: { employeeId: string; x: number; y: number }): Promise<SeatActionResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { error: "場所が正しくありません。" };
  const x = Math.round(parsed.data.x * 10) / 10;
  const y = Math.round(parsed.data.y * 10) / 10;
  const area = areaAt({ x, y });
  if (!area) return { error: "建物の中に置いてください。" };
  if (!(await onRoster(parsed.data.employeeId, actor.today))) return { error: "この社員は組織図に載っていません。" };

  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ area: soshikizuSeatPositions.area, x: soshikizuSeatPositions.x, y: soshikizuSeatPositions.y })
      .from(soshikizuSeatPositions)
      .where(eq(soshikizuSeatPositions.employeeId, parsed.data.employeeId));
    await tx
      .insert(soshikizuSeatPositions)
      .values({ employeeId: parsed.data.employeeId, area, x, y, updatedBy: actor.userId })
      .onConflictDoUpdate({
        target: soshikizuSeatPositions.employeeId,
        set: { area, x, y, updatedBy: actor.userId, updatedAt: new Date() },
      });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "soshikizu.seat.move",
      targetType: "employee",
      targetId: parsed.data.employeeId,
      before: before ?? null,
      after: { area, x, y },
    });
  });
  revalidatePath(MAP_ROUTE);
  return {};
}

export async function resetSeatAction(input: { employeeId: string }): Promise<SeatActionResult> {
  const actor = await requireAppAccess(manifest.appKey);
  const parsed = z.object({ employeeId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "社員が正しくありません。" };

  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(soshikizuSeatPositions)
      .where(eq(soshikizuSeatPositions.employeeId, parsed.data.employeeId))
      .returning({ area: soshikizuSeatPositions.area, x: soshikizuSeatPositions.x, y: soshikizuSeatPositions.y });
    if (removed.length === 0) return;
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: "soshikizu.seat.reset",
      targetType: "employee",
      targetId: parsed.data.employeeId,
      before: removed[0],
    });
  });
  revalidatePath(MAP_ROUTE);
  return {};
}
