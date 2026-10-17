// Google ドキュメントを Word(.docx)で書き出したファイルから、教科書の中身(content.ts の形)を作る。docs/DESIGN.md 30 章。
// 1. mammoth で .docx を HTML にする(画像は取り出して、仮の名前を付ける)。
// 2. HTML を章(見出し 1)ごとに分け、段落・箇条書き・表・画像の部品にする。表紙と目次は捨てる。
// 3. 「理解度チェックテスト」の問題の表と解答の表を、テスト(quiz)の部品にする(読み取れなければ表のまま残す)。
// 元のドキュメントは読むだけで、変えない。
import { createHash, randomUUID } from "node:crypto";
import mammoth from "mammoth";
import { parse, NodeType, type HTMLElement, type Node } from "node-html-parser";
import type { Block, BookContent, Chapter, Inline } from "./content";
import { extractQuizzes } from "./quiz";

export type ExtractedImage = {
  /** 中身から参照する ID(kyokasho.images.id になる)。 */
  id: string;
  contentType: string;
  data: Buffer;
  sha256: string;
};

export type ImportResult = {
  content: BookContent;
  images: ExtractedImage[];
  warnings: string[];
};

/** ブラウザで表示できる画像の種類と、保存するときの拡張子。 */
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const IMAGE_SRC_PREFIX = "kyokasho-image:";

// Google ドキュメントの書き出しでは、見出しの書式名が小文字(heading 1)になる。
const STYLE_MAP = [
  "p[style-name='heading 1'] => h1:fresh",
  "p[style-name='heading 2'] => h2:fresh",
  "p[style-name='heading 3'] => h3:fresh",
  "p[style-name='heading 4'] => h4:fresh",
  "p[style-name='heading 5'] => h5:fresh",
  "p[style-name='heading 6'] => h6:fresh",
];

/** .docx を読み、教科書の中身と画像を返す。 */
export async function importDocx(buffer: Buffer): Promise<ImportResult> {
  const images: ExtractedImage[] = [];
  const bySha = new Map<string, string>();
  const warnings: string[] = [];
  let skippedImages = 0;

  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: STYLE_MAP,
      convertImage: mammoth.images.imgElement(async (image) => {
        const contentType = image.contentType.toLowerCase();
        if (!IMAGE_TYPES[contentType]) {
          skippedImages++;
          return { src: "" };
        }
        const data = await image.readAsBuffer();
        const sha256 = createHash("sha256").update(data).digest("hex");
        // 同じ画像が何度も出てくるときは、1 つだけ保存する。
        let id = bySha.get(sha256);
        if (!id) {
          id = randomUUID();
          bySha.set(sha256, id);
          images.push({ id, contentType, data, sha256 });
        }
        return { src: IMAGE_SRC_PREFIX + id };
      }),
    },
  );
  if (skippedImages > 0) {
    warnings.push(`表示できない形式の画像 ${skippedImages} 個を飛ばしました(図形描画などは、画像に変えると載ります)。`);
  }

  const parsed = parseBookHtml(result.value, (src) =>
    src.startsWith(IMAGE_SRC_PREFIX) ? src.slice(IMAGE_SRC_PREFIX.length) : null,
  );
  // 中身から参照されなかった画像(表紙など)は保存しない。
  const used = new Set(parsed.imageIds);
  return {
    content: parsed.content,
    images: images.filter((i) => used.has(i.id)),
    warnings: [...warnings, ...parsed.warnings],
  };
}

// ---- HTML → 部品 ------------------------------------------------------------------

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === NodeType.ELEMENT_NODE;
}

function tagOf(node: Node): string {
  return isElement(node) ? node.rawTagName?.toLowerCase() ?? "" : "";
}

function normalizeText(text: string): string {
  return text.replace(/[ \t]/g, " ").replace(/ {2,}/g, " ");
}

function plainText(node: Node): string {
  return normalizeText(node.text).trim();
}

/** 文書の中の見出しへのリンク(#_Toc… や、Google ドキュメントの …#heading=h.…)。 */
function isInternalLink(href: string): boolean {
  return href.startsWith("#") || /[#&?]heading=h\./.test(href);
}

/** 目次の行(文書の中の見出しへのリンクだけでできた段落)。 */
function isTocParagraph(node: Node): boolean {
  if (!isElement(node) || tagOf(node) !== "p") return false;
  const links = node.querySelectorAll("a");
  if (links.length === 0) return false;
  if (!links.every((a) => isInternalLink(a.getAttribute("href") ?? ""))) return false;
  const linkText = links.map((a) => a.text).join("");
  return normalizeText(linkText).trim().length >= plainText(node).length - 4;
}

function safeHref(href: string | undefined): string | undefined {
  if (!href || isInternalLink(href)) return undefined;
  return /^https?:\/\//i.test(href) ? href : undefined;
}

/** 段落の中身を、文の一部(太字・リンク)と画像に分ける。 */
function collectInlines(node: Node, resolveImage: (src: string) => string | null) {
  const inlines: Inline[] = [];
  const imageIds: string[] = [];
  const walk = (n: Node, bold: boolean, href: string | undefined) => {
    if (n.nodeType === NodeType.TEXT_NODE) {
      const text = normalizeText(n.text);
      if (text) push({ text, bold, href });
      return;
    }
    if (!isElement(n)) return;
    const tag = tagOf(n);
    if (tag === "br") {
      push({ text: "\n", bold: false, href: undefined });
      return;
    }
    if (tag === "img") {
      const id = resolveImage(n.getAttribute("src") ?? "");
      if (id) imageIds.push(id);
      return;
    }
    const nextBold = bold || tag === "strong" || tag === "b";
    const nextHref = tag === "a" ? safeHref(n.getAttribute("href")) : href;
    for (const c of n.childNodes) walk(c, nextBold, nextHref);
  };
  const push = (part: { text: string; bold: boolean; href: string | undefined }) => {
    const last = inlines[inlines.length - 1];
    if (last && Boolean(last.bold) === part.bold && last.href === part.href) {
      last.text += part.text;
      return;
    }
    const inline: Inline = { text: part.text };
    if (part.bold) inline.bold = true;
    if (part.href) inline.href = part.href;
    inlines.push(inline);
  };
  walk(node, false, undefined);
  // 前後の空白を整える(中身が空白だけなら空にする)。
  while (inlines.length && !inlines[0].text.trim()) inlines.shift();
  while (inlines.length && !inlines[inlines.length - 1].text.trim()) inlines.pop();
  if (inlines.length) {
    inlines[0].text = inlines[0].text.replace(/^\s+/, "");
    const last = inlines[inlines.length - 1];
    last.text = last.text.replace(/\s+$/, "");
  }
  return { inlines, imageIds };
}

type Ctx = {
  resolveImage: (src: string) => string | null;
  imageIds: string[];
  headingCount: number;
  chapterIndex: number;
};

function listItems(list: HTMLElement, ctx: Ctx): Inline[][] {
  const items: Inline[][] = [];
  for (const li of list.childNodes) {
    if (tagOf(li) !== "li" || !isElement(li)) continue;
    // 入れ子の箇条書きは、平らに並べる。
    const nested = li.childNodes.filter((c) => tagOf(c) === "ul" || tagOf(c) === "ol");
    for (const n of nested) li.removeChild(n);
    const { inlines, imageIds } = collectInlines(li, ctx.resolveImage);
    ctx.imageIds.push(...imageIds);
    if (inlines.length) items.push(inlines);
    for (const n of nested) if (isElement(n)) items.push(...listItems(n, ctx));
  }
  return items;
}

/** 要素の並びを部品にする(章の本文と、表のセルの中で共通)。 */
function convertNodes(nodes: Node[], ctx: Ctx, inTable: boolean): Block[] {
  const blocks: Block[] = [];
  for (const node of nodes) {
    const tag = tagOf(node);
    if (!isElement(node)) {
      if (node.nodeType === NodeType.TEXT_NODE && plainText(node)) {
        blocks.push({ type: "paragraph", inlines: [{ text: plainText(node) }] });
      }
      continue;
    }
    if (HEADING_TAGS.has(tag)) {
      const text = plainText(node);
      const level = inTable ? 4 : (Math.min(4, Math.max(2, Number(tag[1]))) as 2 | 3 | 4);
      if (text) {
        ctx.headingCount++;
        blocks.push({ type: "heading", level, id: `s${ctx.chapterIndex + 1}-${ctx.headingCount}`, text });
      }
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      const items = listItems(node, ctx);
      if (items.length) blocks.push({ type: "list", ordered: tag === "ol", items });
      continue;
    }
    if (tag === "table") {
      const rows: Block[][][] = [];
      for (const tr of node.querySelectorAll("tr")) {
        // 入れ子の表の行は、その表の中で扱う。
        if (tr.closest("table") !== node) continue;
        const cells = tr.childNodes.filter((c): c is HTMLElement => tagOf(c) === "td" || tagOf(c) === "th");
        rows.push(cells.map((cell) => convertNodes(cell.childNodes, ctx, true)));
      }
      const nonEmpty = rows.filter((r) => r.some((c) => c.length > 0));
      if (nonEmpty.length) blocks.push({ type: "table", rows: nonEmpty });
      continue;
    }
    // 段落(p)と、その他の要素
    const { inlines, imageIds } = collectInlines(node, ctx.resolveImage);
    if (inlines.length) blocks.push({ type: "paragraph", inlines });
    for (const id of imageIds) {
      ctx.imageIds.push(id);
      blocks.push({ type: "image", id, alt: "" });
    }
  }
  return blocks;
}

/**
 * mammoth が作った HTML を、教科書の中身にする。
 * 章は見出し 1。目次(文書の中へのリンクの段落)があれば、その後ろから読む。なければ、最初の見出し 1 から。
 */
export function parseBookHtml(
  html: string,
  resolveImage: (src: string) => string | null,
): { content: BookContent; imageIds: string[]; warnings: string[] } {
  const root = parse(`<body>${html}</body>`);
  const body = root.querySelector("body");
  const nodes = (body?.childNodes ?? []).filter((n) => isElement(n) || plainText(n));
  const warnings: string[] = [];

  let start = -1;
  nodes.forEach((n, i) => {
    if (isTocParagraph(n)) start = i + 1;
  });
  if (start === -1) start = nodes.findIndex((n) => tagOf(n) === "h1" && plainText(n));
  if (start === -1) {
    warnings.push("見出し 1 が見つからないため、全体を 1 つの章にしました。");
    start = 0;
  }

  const ctx: Ctx = { resolveImage, imageIds: [], headingCount: 0, chapterIndex: 0 };
  const chapters: Chapter[] = [];
  let pending: Node[] = [];
  let title: string | null = null;
  const flush = () => {
    ctx.chapterIndex = chapters.length;
    ctx.headingCount = 0;
    const blocks = convertNodes(pending, ctx, false);
    // 中身のない章(表紙の見出しなど)は載せない。
    if (blocks.length) chapters.push({ title: title ?? "はじめに", blocks });
    pending = [];
  };
  for (const node of nodes.slice(start)) {
    if (tagOf(node) === "h1") {
      const text = plainText(node);
      if (!text) continue;
      flush();
      title = text;
      continue;
    }
    pending.push(node);
  }
  flush();

  for (const chapter of chapters) {
    const r = extractQuizzes(chapter.blocks);
    chapter.blocks = r.blocks;
    for (const w of r.warnings) warnings.push(`「${chapter.title}」: ${w}`);
  }
  return { content: { version: 1, chapters }, imageIds: ctx.imageIds, warnings };
}
