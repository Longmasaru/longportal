// 教科書の部品の並べ方(表示のための下ごしらえ。docs/DESIGN.md 30 章)。
// 元の文書は Word の紙面に合わせて作られているため、そのままではスマホで崩れる。
// - 表のセルの中の「手で入れた改行・字下げ」は、セルの幅が変わると崩れるので、続けて読める 1 つの文にする。
// - 続いて並ぶ画像は、縦に 1 枚ずつではなく、まとめて並べる。
// - 1 つのセルだけの表は「囲み」、見出しの行がある表は、スマホでは 1 行ずつのカードにする。
import type { Block, CellSpan, Inline } from "./content";

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
  const out = inlines.map((i) => ({ ...i, text: i.text.replace(/[\s　]*\n[\s　]*/g, "") })).filter((i) => i.text !== "");
  while (out.length && /^[\s　]/.test(out[0].text)) {
    out[0] = { ...out[0], text: out[0].text.replace(/^[\s　]+/, "") };
    if (out[0].text === "") out.shift();
  }
  return out;
}

const allBold = (b: Extract<Block, { type: "paragraph" }>) => b.inlines.every((i) => i.bold);

/**
 * 表のセルの中身を、続けて読める形にする。段落の頭の字下げと段落の中の改行を除き、
 * 区切りの行(≪業務内容≫ など)でないかぎり、続く段落を 1 つの段落につなぐ。
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
    // 太字どうし・太字でないものどうしは、▼・≪ などの区切りでないかぎりつなぐ(セルの中の太字の題も 1 行にする)。
    const next = { type: "paragraph" as const, inlines };
    if (
      prev?.type === "paragraph" &&
      allBold(prev) === allBold(next) &&
      !HEAD_START.test(prev.inlines[0].text) &&
      !NOTE_START.test(inlines[0].text)
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

/** 表の見せ方。callout = 囲み(セル 1 つ)、cards = スマホでは 1 行ずつのカード、table = 表のまま。 */
export function tableKind(table: TableBlock): "callout" | "cards" | "table" {
  const cells = table.rows.reduce((n, r) => n + r.length, 0);
  if (cells === 1) return "callout";
  if (table.rows.length < 2) return "table";
  const width = Math.max(...table.rows.map((r) => r.length));
  // 縦につながったセルがある表は、カードにすると同じ中身がくり返されるので、表のままにする。
  if (width < 2 || (table.spans ?? []).some((s) => s.rowSpan > 1)) return "table";
  return "cards";
}

export type CardField = { label: Block[]; value: Block[] };
export type Card = { title: Block[]; fields: CardField[] };

function spanAt(spans: CellSpan[] | undefined, row: number, cell: number): number {
  return spans?.find((s) => s.row === row && s.cell === cell)?.colSpan ?? 1;
}

/** 見出しの行(1 行目)を項目名にして、2 行目からを 1 行ずつのカードにする(横につながったセルは、項目名をまとめる)。 */
export function tableCards(table: TableBlock): Card[] {
  const [head, ...body] = table.rows;
  // 見出しの行のセルが、何列目から何列目にかかるか。
  const headCols: { start: number; end: number; cell: Block[] }[] = [];
  let col = 0;
  head.forEach((cell, i) => {
    const span = spanAt(table.spans, 0, i);
    headCols.push({ start: col, end: col + span, cell });
    col += span;
  });
  return body.map((row, r) => {
    const fields: CardField[] = [];
    let at = 0;
    row.forEach((cell, i) => {
      const span = spanAt(table.spans, r + 1, i);
      const labels = headCols.filter((h) => h.start < at + span && h.end > at).map((h) => h.cell);
      at += span;
      const label: Block[] = labels.length === 1 ? labels[0] : joinLabels(labels);
      fields.push({ label, value: cell });
    });
    const [first, ...rest] = fields;
    return { title: first?.value ?? [], fields: rest.filter((f) => f.value.length > 0) };
  });
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
