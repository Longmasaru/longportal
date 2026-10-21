// 人事管理アプリの選択肢と表示ラベル(画面・サーバー・スキーマで共通。DB に依存しないので、クライアントからも読める)。
// docs/DESIGN.md 31 章。

export const RECORD_KINDS = ["talk", "caution", "praise", "transfer"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const RECORD_KIND_LABEL: Record<RecordKind, string> = {
  talk: "面談・話したこと",
  caution: "指導・注意",
  praise: "ほめ",
  transfer: "異動の理由",
};

/** 一覧のタブなど、短い表示。 */
export const RECORD_KIND_SHORT: Record<RecordKind, string> = {
  talk: "面談",
  caution: "注意",
  praise: "ほめ",
  transfer: "異動",
};

/**
 * 記録の公開範囲(31.4)。管理する人には、どれも見える。
 * employee = 本人・上司、supervisors = 上司だけ(本人には見せない)、
 * personal = 本人だけ(上司には見せない。管理者との 1on1 など)、managers = 管理者だけ(本人にも上司にも見せない)。
 */
export const RECORD_VISIBILITIES = ["employee", "supervisors", "personal", "managers"] as const;
export type RecordVisibility = (typeof RECORD_VISIBILITIES)[number];

export const RECORD_VISIBILITY_LABEL: Record<RecordVisibility, string> = {
  employee: "本人に公開",
  supervisors: "上司まで(本人には見せない)",
  personal: "本人と管理者だけ(上司には見せない)",
  managers: "管理者だけ(本人にも上司にも見せない)",
};

export function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === "string" && (RECORD_KINDS as readonly string[]).includes(value);
}

export const TITLE_MAX = 100;
export const BODY_MAX = 5000;
/** 「AIで整える」に必要な最低の文字数(31.3) */
export const POLISH_MIN = 10;
export const TEXT_MAX = 2000;
export const NAME_MAX = 100;

// ---- 人事管理シートの章(31.1) ----

export const SECTIONS = ["basic", "goals", "skills", "character", "condition"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABEL: Record<Section, string> = {
  basic: "1. 基本情報",
  goals: "2. 目標管理・評価",
  skills: "3. スキル・資格・経験",
  character: "4. 人柄・適性",
  condition: "5. コンディション",
};

/** 本人のページに出す章。4・5 章は管理する人だけ。 */
export const SECTION_VISIBLE_TO_SELF: Record<Section, boolean> = {
  basic: true,
  goals: true,
  skills: true,
  character: false,
  condition: false,
};

/** 社員のページのタブ(31.2)。既定は記録。 */
export const TABS = ["records", ...SECTIONS] as const;
export type Tab = (typeof TABS)[number];

export const TAB_LABEL: Record<Tab, string> = {
  records: "記録",
  basic: "基本情報",
  goals: "目標と評価",
  skills: "スキルと資格",
  character: "人柄と適性",
  condition: "コンディション",
};

export function isTab(value: unknown): value is Tab {
  return typeof value === "string" && (TABS as readonly string[]).includes(value);
}

/**
 * 能力の 5 項目(全社共通の軸。レーダーチャートに描く。31.2)。
 * key は DB に保存するので変えない。表示名は変えてよい。
 */
export const ABILITY_AXES = [
  { key: "technique", label: "技術力" },
  { key: "quality", label: "品質" },
  { key: "safety", label: "安全" },
  { key: "setup", label: "段取り" },
  { key: "teamwork", label: "協調性" },
] as const;
export type AbilityAxis = (typeof ABILITY_AXES)[number]["key"];

export const GENDERS = ["male", "female", "other"] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABEL: Record<Gender, string> = { male: "男", female: "女", other: "その他" };

/** hr.profiles の文章の項目(章ごと)。キーは schema の列名(camelCase)と同じ。 */
export const PROFILE_TEXT_FIELDS = {
  goals: [
    { key: "goal", label: "今期の個人目標" },
    { key: "midReview", label: "中間評価" },
    { key: "finalReview", label: "最終評価" },
    { key: "reviewHistory", label: "過去3〜5年の評価履歴" },
    { key: "multiReview", label: "多面評価(360度評価)の結果概要" },
    { key: "careerWish", label: "今後のキャリア希望" },
  ],
  skills: [
    { key: "jobHistory", label: "社内での職務経歴・プロジェクト経験" },
    { key: "priorCareer", label: "前職の経歴(中途採用のみ)" },
  ],
  character: [
    { key: "strengths", label: "本人の強み・弱み" },
    { key: "personality", label: "人柄・コミュニケーションの傾向" },
    { key: "motivation", label: "モチベーションの源泉" },
    { key: "managerComment", label: "上司からの定性コメント" },
  ],
} as const;

export type ProfileTextKey =
  (typeof PROFILE_TEXT_FIELDS)[keyof typeof PROFILE_TEXT_FIELDS][number]["key"];

export const TRAINING_KINDS = ["internal", "external"] as const;
export type TrainingKind = (typeof TRAINING_KINDS)[number];
export const TRAINING_KIND_LABEL: Record<TrainingKind, string> = { internal: "社内", external: "社外" };

export const CONDITION_STATES = ["good", "same", "poor"] as const;
export type ConditionState = (typeof CONDITION_STATES)[number];
export const CONDITION_STATE_LABEL: Record<ConditionState, string> = {
  good: "良好",
  same: "変わらない",
  poor: "不良",
};

/** 満足度(5 = 大変満足 … 1 = 大変不満)。 */
export const SATISFACTION_LABEL: Record<number, string> = {
  5: "大変満足",
  4: "やや満足",
  3: "不満はない",
  2: "やや不満",
  1: "大変不満",
};
