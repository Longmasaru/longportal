// 組織マスタ(部署・拠点・役職・雇用区分)の定義。クライアントからも参照できる(依存なし)。

export const MASTER_KEYS = ["departments", "locations", "positions", "employment-types"] as const;
export type MasterKey = (typeof MASTER_KEYS)[number];

export const MASTER_LABEL: Record<MasterKey, string> = {
  departments: "部署",
  locations: "拠点",
  positions: "役職",
  "employment-types": "雇用区分",
};

export const MASTER_DESCRIPTION: Record<MasterKey, string> = {
  departments: "何の仕事・機能を担当するか。拠点とは独立したマスタです。",
  locations: "どこで勤務するか。部署とは独立したマスタです。",
  positions: "会社上の役職。システムの権限(ロール)とは無関係です。",
  "employment-types": "正社員・パートなどの雇用区分。ここで追加できます。",
};

export function isMasterKey(value: string): value is MasterKey {
  return (MASTER_KEYS as readonly string[]).includes(value);
}

/** 画面・フォームで扱うマスタ 1 行。positions だけ isManagement / rank を持つ。 */
export type MasterRow = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  isManagement?: boolean;
  rank?: number;
};
