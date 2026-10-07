// 表示用のラベル(クライアントからも参照できる)。
import type { EmployeeStatus } from "./schema";

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  planned: "入社予定",
  active: "在籍",
  leave: "休職",
  retired: "退職",
};

export const EMPLOYEE_STATUS_OPTIONS = ["planned", "active", "leave", "retired"] as const;

export const USER_STATUS_LABEL = { active: "有効", disabled: "無効" } as const;
