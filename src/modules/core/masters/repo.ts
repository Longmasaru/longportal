import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { departments } from "../departments/schema";
import { employmentTypes } from "../employment-types/schema";
import { locations } from "../locations/schema";
import { positions } from "../positions/schema";
import type { MasterKey, MasterRow } from "./config";

// 4 つのマスタは code / name / sort_order / is_active を共通で持つ。共通部分の操作は 1 つの型にまとめて扱う
// (positions は追加の列を持つため専用に扱う)。
type BaseTable = typeof departments;
const BASE_TABLES: Record<Exclude<MasterKey, "positions">, BaseTable> = {
  departments,
  locations: locations as unknown as BaseTable,
  "employment-types": employmentTypes as unknown as BaseTable,
};

type BaseRecord = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

function toRow(r: BaseRecord): MasterRow {
  return { id: r.id, code: r.code, name: r.name, sortOrder: r.sortOrder, isActive: r.isActive };
}

type PositionRecord = BaseRecord & { isManagement: boolean; rank: number };

function toPositionRow(r: PositionRecord): MasterRow {
  return { ...toRow(r), isManagement: r.isManagement, rank: r.rank };
}

export async function listMasters(key: MasterKey): Promise<MasterRow[]> {
  if (key === "positions") {
    const rows = await db
      .select()
      .from(positions)
      .orderBy(asc(positions.sortOrder), asc(positions.name));
    return rows.map(toPositionRow);
  }
  const table = BASE_TABLES[key];
  const rows = await db.select().from(table).orderBy(asc(table.sortOrder), asc(table.name));
  return rows.map(toRow);
}

export async function getMaster(key: MasterKey, id: string): Promise<MasterRow | undefined> {
  if (key === "positions") {
    const [r] = await db.select().from(positions).where(eq(positions.id, id)).limit(1);
    return r ? toPositionRow(r) : undefined;
  }
  const table = BASE_TABLES[key];
  const [r] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  return r ? toRow(r) : undefined;
}

type CommonValues = { name: string; sortOrder: number; isActive: boolean };
type PositionValues = { isManagement: boolean; rank: number };

// db / トランザクションのどちらでも使えるよう、実行者を引数で受け取る。
type Executor = Pick<typeof db, "insert" | "update" | "select">;

export async function insertMaster(
  tx: Executor,
  key: MasterKey,
  values: CommonValues & { code: string } & Partial<PositionValues>,
): Promise<MasterRow> {
  if (key === "positions") {
    const [r] = await tx
      .insert(positions)
      .values({
        code: values.code,
        name: values.name,
        sortOrder: values.sortOrder,
        isActive: values.isActive,
        isManagement: values.isManagement ?? false,
        rank: values.rank ?? 0,
      })
      .returning();
    return toPositionRow(r);
  }
  const table = BASE_TABLES[key];
  const [r] = await tx
    .insert(table)
    .values({
      code: values.code,
      name: values.name,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
    })
    .returning();
  return toRow(r);
}

export async function updateMaster(
  tx: Executor,
  key: MasterKey,
  id: string,
  values: CommonValues & Partial<PositionValues>,
): Promise<MasterRow | undefined> {
  if (key === "positions") {
    const [r] = await tx
      .update(positions)
      .set({
        name: values.name,
        sortOrder: values.sortOrder,
        isActive: values.isActive,
        isManagement: values.isManagement ?? false,
        rank: values.rank ?? 0,
      })
      .where(eq(positions.id, id))
      .returning();
    return r ? toPositionRow(r) : undefined;
  }
  const table = BASE_TABLES[key];
  const [r] = await tx
    .update(table)
    .set({ name: values.name, sortOrder: values.sortOrder, isActive: values.isActive })
    .where(eq(table.id, id))
    .returning();
  return r ? toRow(r) : undefined;
}
