// 教科書の部品の並べ方(表示のための下ごしらえ。docs/DESIGN.md 30 章)。
// 元の文書は Word の紙面に合わせて作られているため、そのままではスマホで崩れる。
// - 表のセルの中の「手で入れた改行・字下げ」は、セルの幅が変わると崩れるので、続けて読める 1 つの文にする。
// - 続いて並ぶ画像は、縦に 1 枚ずつではなく、まとめて並べる。
// - 1 つのセルだけの表は「囲み」、見出しの行がある表は、スマホでは 1 行ずつのカードにする。
import type { Block, Inline } from "./content";
import { isSoftBreak, softenLines } from "./typeset";

const ASCII_END = /[A-Za-z0-9.,)]$/;
const ASCII_START = /^[A-Za-z0-9(]/;
const SENTENCE_END = /[。．.!！?？」』）)：:]$/;
const NOTE_START = /^[\s　]*[▼■◆●【≪《※・]/;
const HEAD_START = /^[\s　]*[▼■◆●【≪《]/;
// 紙の幅で折り返した行とみなす長さ(これより短い行は、見出しや項目なので、つながない)。
const WRAPPED_LINE = 12;

/** 区切りの 1 行(全体が太字、または ▼・■・【 などで始まる)。前を空けて、まとまりの境目にする。 */
export function isLabel(block: Block): boolean {
  if (block.type !== "paragraph" || block.inlines.length === 0) return false;
  if (block.inlines.every((i) => i.bold)) return true;
  return /^[\s　]*[▼■◆●【≪《※]/.test(block.inlines[0].text);
}

function trimInlines(inlines: Inline[]): Inline[] {
  const out = inlines.map((i) => ({ ...i, text: softenLines(i.text) })).filter((i) => i.text !== "");
  while (out.length && /^[\s　]/.test(out[0].text)) {
    out[0] = { ...out[0], text: out[0].text.replace(/^[\s　]+/, "") };
    if (out[0].text === "") out.shift();
  }
  return out;
}

const allBold = (b: Extract<Block, { type: "paragraph" }>) => b.inlines.every((i) => i.bold);

/**
 * 表のセルの中身を、続けて読める形にする。段落の頭の字下げを除き、狭いセルに収めるために手で入れた改行
 * (「火花が/散って/引火する」。判定は typeset.ts の isSoftBreak)だけをつなぐ。文の終わり・項目の始まり・
 * 「寸法線/引出線」のような語の並びは分けたまま。
 */
export function flowCell(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    if (block.type !== "paragraph") {
      out.push(block);
      continue;
    }
    const inlines = trimInlines(block.inlines);
    if (inlines.length === 0) continue;
    const prev = out[out.length - 1];
    const next = { type: "paragraph" as const, inlines };
    if (
      prev?.type === "paragraph" &&
      allBold(prev) === allBold(next) &&
      !HEAD_START.test(prev.inlines[0].text) &&
      isSoftBreak(prev.inlines[prev.inlines.length - 1].text.split("\n").pop() ?? "", inlines[0].text.split("\n")[0])
    ) {
      const last = prev.inlines[prev.inlines.length - 1];
      const gap = ASCII_END.test(last.text) && ASCII_START.test(inlines[0].text) ? " " : "";
      out[out.length - 1] = { type: "paragraph", inlines: [...prev.inlines, ...(gap ? [{ text: gap }] : []), ...inlines] };
    } else {
      out.push({ type: "paragraph", inlines });
    }
  }
  return out;
}

export type Placed = { kind: "block"; block: Block } | { kind: "images"; ids: string[] };

/** 続いて並ぶ画像(2 枚以上)を 1 つのまとまりにする。 */
export function groupImages(blocks: Block[]): Placed[] {
  const out: Placed[] = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    if (block.type === "image" && prev) {
      if (prev.kind === "images") {
        prev.ids.push(block.id);
        continue;
      }
      if (prev.block.type === "image") {
        out[out.length - 1] = { kind: "images", ids: [prev.block.id, block.id] };
        continue;
      }
    }
    out.push({ kind: "block", block });
  }
  return out;
}

type TableBlock = Extract<Block, { type: "table" }>;

/**
 * 表の見せ方。callout = 囲み(セル 1 つ)、pairs = 「項目名 | 中身」の 2 列の表(1 枚のカード)、
 * cards = スマホでは 1 件ずつのカード、table = 表のまま。
 */
export function tableKind(table: TableBlock): "callout" | "pairs" | "cards" | "table" {
  const cells = table.rows.reduce((n, r) => n + r.length, 0);
  if (cells === 1) return "callout";
  if (isPairs(table)) return "pairs";
  if (table.rows.length < 2) return "table";
  const width = Math.max(...table.rows.map((r) => r.length));
  // 見出しの行が縦につながっている表は、項目名が決まらないので表のまま。
  if (width < 2 || (table.spans ?? []).some((s) => s.row === 0 && s.rowSpan > 1)) return "table";
  return "cards";
}

// 表の見出しの行によく使われる言葉(2 列目)。
const HEADER_WORD = /^(内容|業務内容|説明|詳細|意味|備考|作業者|対応|対策|注意点|注意事項|理由)$/;

function cellPlain(cell: Block[]): string {
  return cell
    .map((b) => (b.type === "paragraph" ? b.inlines.map((i) => i.text).join("") : ""))
    .join("")
    .replace(/\*\*/g, "")
    .trim();
}

/** 1 列目が短い項目名(文字だけ・10 字まで)の 2 列の表(「ダイ名 | ヘミングダイ」「画像 | (写真)」「用途 | …」)。 */
function isPairs(table: TableBlock): boolean {
  if (table.rows.length < 2 || (table.spans?.length ?? 0) > 0) return false;
  // 1 行目が「項目 | 内容」のような見出しの行なら、1 件ずつのカードにする(cards)。
  if (table.rows[0].length === 2 && HEADER_WORD.test(cellPlain(table.rows[0][1]))) return false;
  return table.rows.every((row) => {
    if (row.length !== 2) return false;
    const label = row[0];
    if (label.length === 0 || label.some((b) => b.type !== "paragraph")) return false;
    const text = cellPlain(label);
    return text.length > 0 && text.length <= 10;
  });
}

/** 「項目名 | 中身」の表を 1 枚のカードにする(題はなし。すべての行を項目にする)。 */
export function tablePairs(table: TableBlock): Card {
  return { title: [], fields: table.rows.map(([label, value]) => ({ label, value })) };
}

/** divider: 1 列目が縦につながった表で、次の行の項目が始まるところ(線で区切る)。 */
export type CardField = { label: Block[]; value: Block[]; divider?: boolean };
export type Card = { title: Block[]; fields: CardField[] };

type Ref = { row: number; cell: number; col: number; colSpan: number };

/** 結合したセルを、表の升目(行・列)に置く。 */
function layoutGrid(table: TableBlock): Ref[][] {
  const grid: Ref[][] = table.rows.map(() => []);
  table.rows.forEach((row, r) => {
    let col = 0;
    row.forEach((_, c) => {
      while (grid[r][col]) col++;
      const span = table.spans?.find((s) => s.row === r && s.cell === c);
      const ref = { row: r, cell: c, col, colSpan: span?.colSpan ?? 1 };
      for (let rr = r; rr < Math.min(table.rows.length, r + (span?.rowSpan ?? 1)); rr++) {
        for (let cc = col; cc < col + ref.colSpan; cc++) grid[rr][cc] = ref;
      }
      col += ref.colSpan;
    });
  });
  return grid;
}

/**
 * 見出しの行(1 行目)を項目名にして、2 行目からを 1 件ずつのカードにする。
 * - 横につながったセルは、項目名をまとめる(「作業者・歩行者」)。
 * - 1 列目が縦につながっているときは、その行をまとめて 1 枚にする(「倉庫」のリーダー・サブリーダー)。
 * - 中身が空のセルも項目として残す(氏名を書き込む欄など。空欄だと分かるように表示する)。
 */
export function tableCards(table: TableBlock): Card[] {
  const grid = layoutGrid(table);
  const headCells = new Map<number, Block[]>();
  for (const ref of grid[0]) if (ref) headCells.set(ref.col, table.rows[0][ref.cell]);
  const labelOf = (ref: Ref) => {
    const cells: Block[][] = [];
    for (let c = ref.col; c < ref.col + ref.colSpan; c++) {
      const cell = headCells.get(c);
      if (cell && !cells.includes(cell)) cells.push(cell);
    }
    return cells.length === 1 ? cells[0] : joinLabels(cells);
  };

  const cards: Card[] = [];
  for (let r = 1; r < table.rows.length; r++) {
    const first = grid[r][0];
    const continued = first !== undefined && first.row < r && cards.length > 0;
    const card: Card = continued ? cards[cards.length - 1] : { title: [], fields: [] };
    if (!continued) cards.push(card);
    const seen = new Set<Ref>();
    let firstOfRow = continued;
    for (const ref of grid[r]) {
      // 縦につながったセルは最初の行でだけ、横につながったセルは 1 回だけ出す。
      if (!ref || ref.row < r || seen.has(ref)) continue;
      seen.add(ref);
      const value = table.rows[ref.row][ref.cell];
      if (ref === first) {
        card.title = value;
        continue;
      }
      const label = labelOf(ref);
      if (value.length === 0 && label.length === 0) continue;
      card.fields.push(firstOfRow ? { label, value, divider: true } : { label, value });
      firstOfRow = false;
    }
  }
  return cards.filter((c) => c.title.length > 0 || c.fields.some((f) => f.value.length > 0));
}

function joinLabels(labels: Block[][]): Block[] {
  const inlines: Inline[] = [];
  labels.forEach((cell, i) => {
    if (i > 0) inlines.push({ text: "・" });
    for (const b of cell) if (b.type === "paragraph") inlines.push(...b.inlines);
  });
  return inlines.length ? [{ type: "paragraph", inlines }] : [];
}

/**
 * 本文の、文の途中で切れた行をつなぐ。元の文書は紙面の幅に合わせて 1 行ずつ段落にしてあるため、
 * スマホでは「注意が/必要です。」のように短い行が残る。前の行が文の終わり(。など)で終わらず、
 * 次の行が区切りや箇条(▼・※・・など)で始まらないときだけ、1 つの段落にする。
 */
export function joinBrokenLines(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    if (
      block.type === "paragraph" &&
      prev?.type === "paragraph" &&
      prev.inlines.length > 0 &&
      block.inlines.length > 0 &&
      allBold(prev) === allBold(block) &&
      prev.inlines.reduce((n, i) => n + i.text.trim().length, 0) >= WRAPPED_LINE &&
      !/^　/.test(block.inlines[0].text) === !/^　/.test(prev.inlines[0].text) &&
      !SENTENCE_END.test(prev.inlines[prev.inlines.length - 1].text.trimEnd()) &&
      !NOTE_START.test(block.inlines[0].text) &&
      !prev.inlines[prev.inlines.length - 1].text.includes("\n")
    ) {
      const last = prev.inlines[prev.inlines.length - 1].text.trimEnd();
      const gap = ASCII_END.test(last) && ASCII_START.test(block.inlines[0].text) ? " " : "";
      out[out.length - 1] = { type: "paragraph", inlines: [...prev.inlines, ...(gap ? [{ text: gap }] : []), ...block.inlines] };
      continue;
    }
    out.push(block);
  }
  return out;
}
