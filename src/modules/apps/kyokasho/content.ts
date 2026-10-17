// 教科書の中身の形(DB の kyokasho.books.content に JSON で保存する)。docs/DESIGN.md 30 章。
// Google ドキュメントを Word(.docx)で書き出したものから、import.ts が作る。画面は components/blocks.tsx が描く。
// DB に依存しないので、クライアントからも読める。

/** 文の一部(太字・リンク)。 */
export type Inline = { text: string; bold?: boolean; href?: string };

export type QuizOption = { label: string; text: string };

export type QuizQuestion = {
  /** 問題の番号(①など、元の表の左の列)。 */
  no: string;
  question: string;
  options: QuizOption[];
  /** 正解の記号(A など)。 */
  answer: string;
  explanation: string;
};

/** 表のセルの結合(縦・横につながったセル)。row・cell は rows の中の位置。結合のないセルは載せない。 */
export type CellSpan = { row: number; cell: number; rowSpan: number; colSpan: number };

export type Block =
  | { type: "heading"; level: 2 | 3 | 4; id: string; text: string }
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "image"; id: string; alt: string }
  | { type: "table"; rows: Block[][][]; spans?: CellSpan[] }
  | { type: "quiz"; questions: QuizQuestion[] };

export type Chapter = {
  title: string;
  blocks: Block[];
};

export type BookContent = {
  version: 1;
  chapters: Chapter[];
};

/** 章の中の見出し(目次用)。 */
export function chapterOutline(chapter: Chapter): { id: string; level: 2 | 3 | 4; text: string }[] {
  return chapter.blocks.flatMap((b) => (b.type === "heading" ? [{ id: b.id, level: b.level, text: b.text }] : []));
}

/** 中身が参照する画像の ID(表の中も含む)。 */
export function collectImageIds(blocks: Block[]): string[] {
  const ids: string[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      if (b.type === "image") ids.push(b.id);
      else if (b.type === "table") for (const row of b.rows) for (const cell of row) walk(cell);
    }
  };
  walk(blocks);
  return ids;
}

export function countQuizQuestions(chapter: Chapter): number {
  return chapter.blocks.reduce((n, b) => n + (b.type === "quiz" ? b.questions.length : 0), 0);
}
