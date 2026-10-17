// 「理解度チェックテスト」の表を、テストの部品にする。docs/DESIGN.md 30 章。
// 元の形: 見出し「理解度チェックテスト」の下に、問題の表(①〜 と、問題文 + A. B. C. の選択肢)と、
// 解答の表(①〜 と、正解の記号 + 解説)がある。読み取れないときは、表のまま残して注意を返す。
import type { Block, QuizOption, QuizQuestion } from "./content";

const QUIZ_HEADING = /理解度チェック/;
const NUMBER_MARK = /^(?:[①-⑳㉑-㉟]|[(（]?[0-9０-９]{1,2}[)）.．]?|問[0-9０-９]{1,2})$/;
// 選択肢の印(A. B. …)。前が英数字のとき(CAD. など)は印とみなさない。
const OPTION_MARK = /(?<![A-Za-z0-9Ａ-Ｚａ-ｚ０-９])([A-EＡ-Ｅ])\s*[.．。:：、)）]\s*/g;

function toAscii(s: string): string {
  return s.replace(/[Ａ-Ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** セルの文字(段落ごとに改行)。 */
export function cellText(cell: Block[]): string {
  return cell
    .map((b) => {
      if (b.type === "paragraph") return b.inlines.map((i) => i.text).join("");
      if (b.type === "list") return b.items.map((it) => it.map((i) => i.text).join("")).join("\n");
      if (b.type === "heading") return b.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** 問題文と選択肢に分ける(選択肢が A から順に 2 つ以上なければ null)。 */
export function splitQuestion(text: string): { question: string; options: QuizOption[] } | null {
  const marks: { label: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(OPTION_MARK)) {
    const start = m.index ?? 0;
    marks.push({ label: toAscii(m[1]), start, end: start + m[0].length });
  }
  // A, B, C… の順に並んだものだけを選択肢とみなす(文中の「A.」などを拾わないよう、最初の A から数える)。
  const firstA = marks.findIndex((m) => m.label === "A");
  if (firstA === -1) return null;
  const seq: typeof marks = [];
  for (const m of marks.slice(firstA)) {
    if (m.label === String.fromCharCode(65 + seq.length)) seq.push(m);
  }
  if (seq.length < 2) return null;
  const question = text.slice(0, seq[0].start).replace(/\s+/g, " ").trim();
  if (!question) return null;
  const options = seq.map((m, i) => ({
    label: m.label,
    text: text
      .slice(m.end, i + 1 < seq.length ? seq[i + 1].start : undefined)
      .replace(/\s+/g, " ")
      .trim(),
  }));
  if (options.some((o) => !o.text)) return null;
  return { question, options };
}

/** 正解の記号と解説に分ける。 */
export function splitAnswer(text: string): { answer: string; explanation: string } | null {
  const m = /^\s*(?:正解\s*[:：]?\s*)?([A-EＡ-Ｅ])(?![A-Za-z])/.exec(text);
  if (!m) return null;
  const rest = text.slice(m[0].length);
  const explanation = rest.replace(/^[\s　]*(?:解説\s*[:：]?)?/, "").replace(/\s+/g, " ").trim();
  return { answer: toAscii(m[1]), explanation };
}

type Row = { no: string; text: string };

function numberedRows(table: TableBlock): Row[] {
  const rows: Row[] = [];
  for (const row of table.rows) {
    if (row.length < 2) continue;
    const no = cellText(row[0]).replace(/\s+/g, "");
    if (!NUMBER_MARK.test(no)) continue;
    rows.push({ no, text: row.slice(1).map(cellText).filter(Boolean).join("\n") });
  }
  return rows;
}

type TableBlock = Extract<Block, { type: "table" }>;

function parseQuiz(tables: TableBlock[]): { questions: QuizQuestion[]; used: Set<TableBlock> } | null {
  const used = new Set<TableBlock>();
  let questions: { no: string; question: string; options: QuizOption[] }[] | null = null;
  let answers: Map<string, { answer: string; explanation: string }> | null = null;
  for (const table of tables) {
    const rows = numberedRows(table);
    if (rows.length === 0) continue;
    const asQuestions = rows.map((r) => ({ no: r.no, parsed: splitQuestion(r.text) }));
    if (!questions && asQuestions.every((q) => q.parsed)) {
      questions = asQuestions.map((q) => ({ no: q.no, ...q.parsed! }));
      used.add(table);
      continue;
    }
    const asAnswers = rows.map((r) => ({ no: r.no, parsed: splitAnswer(r.text) }));
    if (!answers && asAnswers.every((a) => a.parsed)) {
      answers = new Map(asAnswers.map((a) => [a.no, a.parsed!]));
      used.add(table);
    }
  }
  if (!questions || !answers) return null;
  const result: QuizQuestion[] = [];
  for (const q of questions) {
    const a = answers.get(q.no);
    if (!a || !q.options.some((o) => o.label === a.answer)) return null;
    result.push({ ...q, ...a });
  }
  return { questions: result, used };
}

/**
 * 章の部品の中の「理解度チェックテスト」を、テストの部品に置き換える。
 * 見出しの下(次の同じ・上の階層の見出しまで)の表を読む。読めた表だけを置き換え、ほかの部品は残す。
 */
export function extractQuizzes(blocks: Block[]): { blocks: Block[]; warnings: string[] } {
  const out: Block[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    out.push(b);
    if (b.type !== "heading" || !QUIZ_HEADING.test(b.text)) continue;
    let end = i + 1;
    while (end < blocks.length) {
      const n = blocks[end];
      if (n.type === "heading" && n.level <= b.level) break;
      end++;
    }
    const section = blocks.slice(i + 1, end);
    const tables = section.filter((s): s is TableBlock => s.type === "table");
    const quiz = tables.length ? parseQuiz(tables) : null;
    if (!quiz) {
      if (tables.length) warnings.push(`テストの表を読み取れなかったため、表のまま載せます(見出し「${b.text}」)。`);
      continue;
    }
    // 問題の表の位置にテストを置き、テストにした表は除く。
    let placed = false;
    for (const s of section) {
      if (s.type === "table" && quiz.used.has(s)) {
        if (!placed) out.push({ type: "quiz", questions: quiz.questions });
        placed = true;
        continue;
      }
      out.push(s);
    }
    i = end - 1;
  }
  return { blocks: out, warnings };
}
