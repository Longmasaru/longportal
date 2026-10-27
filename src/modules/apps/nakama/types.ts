import type { ResidenceStatus } from "./constants";

/** 名簿に載せる 1 人(社員マスタ・今日の主所属・名簿の行を合わせたもの)。 */
export type NakamaMember = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  nameKana: string | null;
  nativeName: string;
  nickname: string;
  arrivedOn: string | null;
  hometown: string;
  note: string;
  hiredOn: string;
  departmentId: string | null;
  departmentName: string | null;
  departmentSortOrder: number | null;
  locationName: string | null;
  residenceStatus: ResidenceStatus | null;
  residenceExpiresOn: string | null;
};

export type NakamaFormState = { error?: string; success?: string } | undefined;
