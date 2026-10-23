// 名簿の選択肢と上限(画面・サーバー・スキーマで共通。DB に依存しないので、クライアントからも読める)。docs/DESIGN.md 43 章。

export const NATIVE_NAME_MAX = 100;
export const NICKNAME_MAX = 30;
export const HOMETOWN_MAX = 50;
export const NOTE_MAX = 100;

/**
 * 在留資格(任意)。札と印刷に「日本に来て ○年目」と並べて出す(残りの年数は出さない。2026-10-23 のユーザーの判断:
 * 「あと何年」と紙に書いてあるのは悲しい。資格と年目が分かれば、頭で計算できる)。
 */
export const RESIDENCE_STATUSES = [
  "technical_intern_1",
  "technical_intern_2",
  "technical_intern_3",
  "employment_training",
  "specified_skilled_1",
  "specified_skilled_2",
  "engineer",
  "permanent",
  "family",
  "other",
] as const;
export type ResidenceStatus = (typeof RESIDENCE_STATUSES)[number];

export const RESIDENCE_STATUS_LABEL: Record<ResidenceStatus, string> = {
  technical_intern_1: "技能実習 1 号",
  technical_intern_2: "技能実習 2 号",
  technical_intern_3: "技能実習 3 号",
  employment_training: "育成就労",
  specified_skilled_1: "特定技能 1 号",
  specified_skilled_2: "特定技能 2 号",
  engineer: "技人国",
  permanent: "永住者",
  family: "家族(配偶者など)",
  other: "その他",
};

/** 在留期限(任意)は札・印刷に出さず、管理の画面だけで使う。この日数以内になったら、管理の画面で知らせる(更新の申請は、おおむね期限の 3 か月前からできる)。 */
export const EXPIRY_WARN_DAYS = 90;
