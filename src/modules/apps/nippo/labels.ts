// 日報アプリの項目と表示ラベル(画面・サーバー・スキーマで共通。DB に依存しないので、クライアントからも読める)。
// docs/DESIGN.md 37 章。項目は、Google ドキュメントの「日報まとめ」(2026-10 時点の様式)に合わせる。

/** 文章の項目(DB の列と 1 対 1)。並びは画面の順。 */
export const TEXT_FIELDS = [
  "training",
  "topLearning",
  "taught",
  "asked",
  "noticed",
  "canDo",
  "difficult",
  "unclear",
  "tomorrow",
] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

export type FieldDef = {
  label: string;
  /** 見出しの番号つきの章(同じ章の項目はまとめて出す) */
  section: string;
  placeholder: string;
  rows: number;
};

export const FIELD_DEF: Record<TextField, FieldDef> = {
  training: {
    section: "1. 今日の研修内容",
    label: "今日の研修内容",
    placeholder: "・午前: ○○の図面作成\n・午後: ○○の見学",
    rows: 4,
  },
  topLearning: {
    section: "2. 教わったこと・学んだこと",
    label: "今日一番の学び",
    placeholder: "一言で(書かなくてもかまいません)",
    rows: 2,
  },
  taught: {
    section: "2. 教わったこと・学んだこと",
    label: "指導で教わったこと",
    placeholder: "教わった手順・ルール・コツなど",
    rows: 5,
  },
  asked: {
    section: "2. 教わったこと・学んだこと",
    label: "質問して分かったこと",
    placeholder: "Q: ○○は消してもよいか?\nA: 消してよい。理由は…",
    rows: 4,
  },
  noticed: {
    section: "2. 教わったこと・学んだこと",
    label: "自分で気づいたこと",
    placeholder: "",
    rows: 3,
  },
  canDo: {
    section: "3. 一人でできるようになったこと",
    label: "一人でできるようになったこと・前よりうまくできたこと",
    placeholder: "なければ「特になし」",
    rows: 3,
  },
  difficult: {
    section: "4. 難しかったこと",
    label: "難しかったこと",
    placeholder: "",
    rows: 3,
  },
  unclear: {
    section: "5. まだ分からないこと",
    label: "まだ分からないこと・聞きたいこと",
    placeholder: "(○○さんへ)…",
    rows: 3,
  },
  tomorrow: {
    section: "7. 明日の予定",
    label: "明日の予定",
    placeholder: "・○○のつづき",
    rows: 3,
  },
};

/** 文章の項目の上限(1 項目あたり)。 */
export const FIELD_MAX = 5000;
/** コンディション(今日の点数)。 */
export const SCORE_MIN = 1;
export const SCORE_MAX = 10;
export const SCORE_NOTE_MAX = 500;
/** コメントの上限。 */
export const COMMENT_MAX = 3000;
/** AI で項目に振り分けるメモの長さ。 */
export const MEMO_MIN = 20;
export const MEMO_MAX = 20000;

export const REPORT_STATUSES = ["draft", "submitted"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "下書き",
  submitted: "提出済み",
};

/** 指導者の一覧の絞り込み。 */
export const REVIEW_VIEWS = ["pending", "all"] as const;
export type ReviewView = (typeof REVIEW_VIEWS)[number];

export function isReviewView(value: unknown): value is ReviewView {
  return typeof value === "string" && (REVIEW_VIEWS as readonly string[]).includes(value);
}
