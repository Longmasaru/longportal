// 手順書の中身の形(docs/DESIGN.md 43 章)。手順書は guides/ に 1 つずつ置き、guides/index.ts の GUIDES に並べる。

/** 本文の部品。画面(components/blocks.tsx)はこの種類ごとに描く。 */
export type Block =
  | { kind: "text"; text: string }
  /** 番号つきの手順。label はボタン名など、画面の表記をそのまま書く(「」で囲んで強調する)。 */
  | { kind: "steps"; steps: { text: string; note?: string }[] }
  | { kind: "list"; items: string[] }
  /** tip = こつ、warn = 気をつけること、info = 補足。 */
  | { kind: "callout"; tone: "tip" | "warn" | "info"; title?: string; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "faq"; items: { q: string; a: string }[] };

export type GuideSection = {
  /** ページ内リンクの id(手順書の中で一意。半角小文字・数字・`-`)。 */
  id: string;
  title: string;
  /** 目次の下に出す一言。 */
  summary?: string;
  /** 小見出しごとのまとまり。小見出しがなければ title は省く。 */
  parts: { title?: string; blocks: Block[] }[];
};

export type Guide = {
  /** URL の名前(`/apps/tejunsho/<slug>`)。一度決めたら変えない。 */
  slug: string;
  /** 一覧でのまとまり(例: 社内システム)。 */
  category: string;
  title: string;
  description: string;
  /** 内容を確かめた日(YYYY-MM-DD)。画面では YYYY.MM.DD で出す。 */
  checkedOn: string;
  /** 一覧の並び(小さいほど上)。 */
  sortOrder: number;
  /** 最初に読んでほしい要点。 */
  highlights?: string[];
  sections: GuideSection[];
  /** 出典(公式のヘルプなど)。 */
  sources: { label: string; url: string }[];
};
