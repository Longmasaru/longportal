// カイゼン図鑑の決まり(docs/DESIGN.md 44 章)。DB・ネットワークに依存しない純粋な定数と関数。

/** 章(改善の種類)。key は DB に保存するので変えない(表示名は変えてよい)。 */
export const ZUKAN_CHAPTERS = ["jitan", "anzen", "hinshitsu", "katazuke", "cost", "raku", "other"] as const;
export type ZukanChapter = (typeof ZUKAN_CHAPTERS)[number];

export const CHAPTER_LABEL: Record<ZukanChapter, { label: string; hint: string }> = {
  jitan: { label: "時短", hint: "早くなった・手間が減った" },
  anzen: { label: "安全", hint: "危なくなくなった" },
  hinshitsu: { label: "品質", hint: "ミス・不良が減った" },
  katazuke: { label: "片づけ・5S", hint: "探さない・散らからない" },
  cost: { label: "コスト", hint: "お金・材料が減った" },
  raku: { label: "ラクになる", hint: "体や気持ちがラク" },
  other: { label: "その他", hint: "" },
};

/** 発見待ち(ビフォーだけ保存した下書き)/ 登録済み(図鑑に載った)。 */
export const ZUKAN_STATUSES = ["draft", "published"] as const;
export type ZukanStatus = (typeof ZUKAN_STATUSES)[number];

export const PHOTO_KINDS = ["before", "after"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

/** 見た人の反応。点数には入れない(仲のいい人同士で押し合うのを防ぐ)。 */
export const REACTION_KINDS = ["naruhodo", "maneshitai"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];
export const REACTION_LABEL: Record<ReactionKind, string> = {
  naruhodo: "なるほど!",
  maneshitai: "まねしたい!",
};

/** 鑑定の観点。各 1〜5 点。key は DB の列名・AI の出力に使うので変えない。 */
export const CRITERIA = ["effect", "idea", "reuse", "sustain"] as const;
export type Criterion = (typeof CRITERIA)[number];
export const CRITERION_LABEL: Record<Criterion, { label: string; hint: string }> = {
  effect: { label: "効果", hint: "時間・お金・安全・品質がどれだけ良くなったか" },
  idea: { label: "工夫", hint: "アイデアの新しさ、ちょっとしたひらめき" },
  reuse: { label: "まねしやすさ", hint: "ほかの部署でもすぐ使えるか" },
  sustain: { label: "続けやすさ", hint: "やりっぱなしでなく、続く仕組みか" },
};
export const CRITERION_MIN = 1;
export const CRITERION_MAX = 5;
export type CriterionScores = Record<Criterion, number>;

export const TITLE_MAX = 30;
export const WHAT_MAX = 500;
export const EFFECT_MAX = 200;
export const PLACE_MAX = 100;
export const MEMO_MAX = 500;
export const COMMENT_MAX = 300;
export const APPRAISAL_COMMENT_MAX = 200;
/** ビフォー・アフターそれぞれの写真の枚数。 */
export const PHOTO_MAX_PER_KIND = 2;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** 1 人が 1 日に保存できるページの数(発見待ちを含む。連投の防止)。 */
export const DAILY_ENTRY_LIMIT = 20;
/** 一覧に出す件数。 */
export const LIST_LIMIT = 120;

/** 点数を確定する(鑑定する)権限(全社で割り当てる)。AI の下見も見られる。 */
export const APPRAISE_PERMISSION = "zukan.entries.appraise";
/** 不適切なページの削除(全社で割り当てる)。 */
export const MANAGE_PERMISSION = "zukan.entries.manage";

/** 図鑑番号の表示(3 桁以上の 0 埋め)。 */
export function formatNo(n: number): string {
  return `No.${String(n).padStart(3, "0")}`;
}

/** 4 観点の合計(4〜20)を 100 点満点に換算する。 */
export function scoreOf(s: CriterionScores): number {
  const total = CRITERIA.reduce((sum, c) => sum + s[c], 0);
  return Math.round((total / (CRITERIA.length * CRITERION_MAX)) * 100);
}

export function isValidCriterionScore(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= CRITERION_MIN && (n as number) <= CRITERION_MAX;
}

/** レア度(★の数)。点数が未確定なら null(「鑑定中」)。 */
export type Rarity = 1 | 2 | 3 | 4 | 5;
export function rarityOf(score: number | null): Rarity | null {
  if (score === null) return null;
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  return 1;
}

export const RARITY_LABEL: Record<Rarity, string> = {
  1: "通常",
  2: "銅",
  3: "銀",
  4: "金",
  5: "特別",
};

/** 自分の図鑑の印(登録数の節目)。到達した中でいちばん大きいものと、次の節目。 */
export const MILESTONES = [
  { count: 1, label: "はじめの 1 ページ" },
  { count: 10, label: "10 ページ" },
  { count: 30, label: "30 ページ" },
  { count: 50, label: "50 ページ" },
] as const;
export function milestoneOf(count: number): {
  reached: (typeof MILESTONES)[number] | null;
  next: (typeof MILESTONES)[number] | null;
} {
  let reached: (typeof MILESTONES)[number] | null = null;
  for (const m of MILESTONES) if (count >= m.count) reached = m;
  const next = MILESTONES.find((m) => count < m.count) ?? null;
  return { reached, next };
}

/** 登録に足りないもの(画面と Server Action で同じ判定を使う)。発見待ちの保存はビフォーの写真だけでよい。 */
export type MissingField = "before" | "after" | "title" | "chapter";

export function missingFields(input: {
  mode: "publish" | "draft";
  beforeCount: number;
  afterCount: number;
  title: string;
  chapter: string | null | undefined;
}): MissingField[] {
  const missing: MissingField[] = [];
  if (input.beforeCount === 0) missing.push("before");
  if (input.mode === "draft") return missing;
  if (input.afterCount === 0) missing.push("after");
  if (input.title.trim() === "") missing.push("title");
  if (!ZUKAN_CHAPTERS.includes(input.chapter as ZukanChapter)) missing.push("chapter");
  return missing;
}

export const MISSING_MESSAGE: Record<MissingField, string> = {
  before: "ビフォーの写真がありません",
  after: "アフターの写真がありません",
  title: "名前が空です",
  chapter: "章が選ばれていません",
};

/** AI の下見(entries.ai_review に保存する形)。 */
export type AiReview = {
  scores: CriterionScores;
  reasons: Record<Criterion, string>;
  /** 鑑定する人向けのひとこと(全体の見立て)。 */
  summary: string;
  model: string;
  /** ISO 8601 */
  at: string;
};

/** 本人に、まだ見ていない鑑定の結果があるか。 */
export function unseenReveal(entry: { appraisedAt: Date | null; revealSeenAt: Date | null }): boolean {
  if (!entry.appraisedAt) return false;
  return !entry.revealSeenAt || entry.appraisedAt > entry.revealSeenAt;
}
