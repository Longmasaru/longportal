import type { AbilityAxis, ConditionState, RecordKind, RecordVisibility, TrainingKind } from "./labels";
import type { HrProfileRow } from "./schema";

/** 今日有効な所属(主所属が先頭)。 */
export type ProfileAssignment = {
  locationId: string;
  locationName: string;
  departmentId: string;
  departmentName: string;
  isPrimary: boolean;
};

/** 社員のページの基本情報。 */
export type EmployeeProfile = {
  id: string;
  employeeNumber: string;
  name: string;
  nameKana: string | null;
  positionName: string | null;
  employmentTypeName: string | null;
  hiredOn: string;
  leftOn: string | null;
  status: string;
  assignments: ProfileAssignment[];
};

/** 画面に渡す記録。 */
export type HrRecord = {
  id: string;
  kind: RecordKind;
  occurredOn: string;
  title: string;
  body: string;
  visibility: RecordVisibility;
  authorName: string | null;
  authorLoginId: string | null;
  updatedAt: Date;
};

export type RecordFormState = { error?: string; ok?: number } | undefined;

/** 人事管理シートの 1〜5 章のデータ。 */
export type HrSheet = {
  profile: HrProfileRow | null;
  qualifications: { id: string; name: string; acquiredOn: string | null; expiresOn: string | null }[];
  skills: { id: string; name: string; level: number }[];
  /** 能力の 5 項目(付いていない軸はない) */
  abilities: Partial<Record<AbilityAxis, number>>;
  trainings: { id: string; kind: TrainingKind; title: string; takenOn: string | null }[];
  /** 新しい順 */
  conditions: {
    id: string;
    checkedOn: string;
    health: ConditionState | null;
    mental: ConditionState | null;
    satisfaction: number | null;
    note: string;
  }[];
};
