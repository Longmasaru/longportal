// Google ドキュメントを Word(.docx)、または「ウェブページ」(zip)で書き出したファイルから、教科書の中身(content.ts の形)を作る。docs/DESIGN.md 30 章。
// 1. mammoth で .docx を HTML にする(画像は取り出して、仮の名前を付ける)。
// 2. HTML を章(見出し 1)ごとに分け、段落・箇条書き・表・画像の部品にする。表紙と目次は捨てる。
// 3. 「理解度チェックテスト」の問題の表と解答の表を、テスト(quiz)の部品にする(読み取れなければ表のまま残す)。
// 4. 大きな写真は、スマホでも軽く見られるよう、長い辺 1600px までに縮めて WebP にする(元より小さくなるときだけ)。
// 元のドキュメントは読むだけで、変えない。
import { createHash, randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import mammoth from "mammoth";
import sharp from "sharp";
import { parse, NodeType, type HTMLElement, type Node } from "node-html-parser";
import type { Block, BookContent, CellSpan, Chapter, Inline } from "./content";
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
  /** 新しく保存する画像(縮めたもの)。 */
  images: ExtractedImage[];
  /** 前回の取り込みと同じ画像で、保存済みのものをそのまま使う ID。 */
  reusedImageIds: string[];
  /** 元の画像の sha256 → 中身から参照する ID(次の取り込みで、同じ画像を使い回すため)。 */
  imageShas: Record<string, string>;
  /** 1px 四方などの空の画像の数(Word の書き出しでは、図形描画がこれになる)。 */
  blankImages: number;
  /** 文書に出てくる順の、画像ごとの元の大きさ(読めなければ null)。図形描画を埋めるときの照らし合わせに使う。 */
  imageSizes: (ImageSize | null)[];
  warnings: string[];
};

export type ImageSize = { width: number; height: number };

/** ウェブページの書き出しから取り出した、文書に出てくる順の画像(図形描画の図もある)。 */
export type PageImage = { data: Buffer; contentType: string; size: ImageSize | null };

/** 前回の取り込みで保存済みの画像(元の画像の sha256 → ID)。 */
export type KnownImages = Readonly<Record<string, string>>;

/** ブラウザで表示できる画像の種類と、保存するときの拡張子。 */
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const IMAGE_SRC_PREFIX = "kyokasho-image:";

/** 表示用に縮める大きさ(長い辺)。 */
const MAX_IMAGE_EDGE = 1600;

/**
 * 写真を表示用に縮める。動く GIF・SVG はそのまま。読めない・縮めても小さくならないときも元のまま。
 * 1px 四方などの飾りの画像は null(載せない)。
 */
export async function optimizeImage(data: Buffer, contentType: string): Promise<{ data: Buffer; contentType: string } | null> {
  if (contentType === "image/svg+xml") return { data, contentType };
  try {
    const meta = await sharp(data).metadata();
    if ((meta.width ?? 0) <= 2 && (meta.height ?? 0) <= 2) return null;
    if (contentType === "image/gif") return { data, contentType };
    const out = await sharp(data)
      .rotate()
      .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return out.byteLength < data.byteLength ? { data: out, contentType: "image/webp" } : { data, contentType };
  } catch {
    return { data, contentType };
  }
}

// Google ドキュメントの書き出しでは、見出しの書式名が小文字(heading 1)になる。
const STYLE_MAP = [
  "p[style-name='heading 1'] => h1:fresh",
  "p[style-name='heading 2'] => h2:fresh",
  "p[style-name='heading 3'] => h3:fresh",
  "p[style-name='heading 4'] => h4:fresh",
  "p[style-name='heading 5'] => h5:fresh",
  "p[style-name='heading 6'] => h6:fresh",
];

/** 取り出した画像を、同じものは 1 つにまとめ、縮めて ID を付ける。前回と同じ画像(known)は、縮め直さずに前回の ID を使う。 */
function createImageCollector(known: KnownImages = {}) {
  const images: ExtractedImage[] = [];
  const bySha = new Map<string, string>();
  const reused = new Set<string>();
  let skipped = 0;
  let blank = 0;
  return {
    images,
    bySha,
    reused,
    get skipped() {
      return skipped;
    },
    get blank() {
      return blank;
    },
    /** 載せられなかった空の画像を数える(図形描画の見分けに使う)。 */
    countBlank() {
      blank++;
    },
    /** 画像を登録し、中身から参照する ID を返す(載せない画像は "")。 */
    async add(original: Buffer, contentType: string): Promise<string> {
      if (!IMAGE_TYPES[contentType]) {
        skipped++;
        return "";
      }
      const sha256 = createHash("sha256").update(original).digest("hex");
      // 同じ画像が何度も出てくるときは、1 つだけ保存する。
      let id = bySha.get(sha256);
      if (id === undefined) {
        if (known[sha256]) {
          id = known[sha256];
          reused.add(id);
        } else {
          const optimized = await optimizeImage(original, contentType);
          id = optimized ? randomUUID() : "";
          if (optimized) images.push({ id, contentType: optimized.contentType, data: optimized.data, sha256 });
        }
        bySha.set(sha256, id);
      }
      return id;
    },
  };
}

function finish(
  html: string,
  collector: ReturnType<typeof createImageCollector>,
  warnings: string[],
  imageSizes: (ImageSize | null)[],
): ImportResult {
  if (collector.skipped > 0) {
    warnings.push(`表示できない形式の画像 ${collector.skipped} 個を飛ばしました(図形描画などは、画像に変えると載ります)。`);
  }
  const parsed = parseBookHtml(html, (src) => (src.startsWith(IMAGE_SRC_PREFIX) ? src.slice(IMAGE_SRC_PREFIX.length) : null));
  // 中身から参照されなかった画像(表紙など)は保存しない。
  const used = new Set(parsed.imageIds);
  return {
    content: parsed.content,
    images: collector.images.filter((i) => used.has(i.id)),
    reusedImageIds: [...collector.reused].filter((id) => used.has(id)),
    imageShas: Object.fromEntries([...collector.bySha].filter(([, id]) => id && used.has(id))),
    blankImages: collector.blank,
    imageSizes,
    warnings: [...warnings, ...parsed.warnings],
  };
}

async function sizeOf(data: Buffer): Promise<ImageSize | null> {
  try {
    const meta = await sharp(data).metadata();
    return meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
  } catch {
    return null;
  }
}

const isBlankSize = (size: ImageSize | null) => size !== null && size.width <= 2 && size.height <= 2;

/**
 * .docx を読み、教科書の中身と画像を返す。
 * drawings(ウェブページの書き出しの画像。文書に出てくる順)を渡すと、Word で空になった図形描画を、同じ順番の画像で埋める。
 * 写真は Word の元の大きさのまま、図だけをウェブページから取れる。順番が合っているかは、呼ぶ側が imagesAlign で確かめる。
 */
export async function importDocx(buffer: Buffer, known?: KnownImages, drawings?: (PageImage | null)[]): Promise<ImportResult> {
  const collector = createImageCollector(known);
  const imageSizes: (ImageSize | null)[] = [];
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: STYLE_MAP,
      convertImage: mammoth.images.imgElement(async (image) => {
        const index = imageSizes.length;
        const data = await image.readAsBuffer();
        const contentType = image.contentType.toLowerCase();
        const size = IMAGE_TYPES[contentType] ? await sizeOf(data) : null;
        imageSizes.push(size);
        let id = await collector.add(data, contentType);
        const drawing = drawings?.[index];
        if (!id && isBlankSize(size) && drawing) id = await collector.add(drawing.data, drawing.contentType);
        if (!id && IMAGE_TYPES[contentType]) collector.countBlank();
        return { src: id ? IMAGE_SRC_PREFIX + id : "" };
      }),
    },
  );
  return finish(result.value, collector, [], imageSizes);
}

/**
 * Word の画像とウェブページの画像が、同じ順番で並んでいるか(図形描画を埋めてよいか)。
 * 数が同じで、写真どうし(空でない画像)の縦横の比がおおむね合っていること。
 * ウェブページの写真は表示の大きさに縮み、切り抜きも反映されるので、比が合わないものが少しあるのは許す。
 */
export function imagesAlign(docx: (ImageSize | null)[], page: (ImageSize | null)[]): boolean {
  if (docx.length === 0 || docx.length !== page.length) return false;
  let compared = 0;
  let matched = 0;
  docx.forEach((d, i) => {
    const p = page[i];
    if (!d || !p || isBlankSize(d)) return;
    compared++;
    const ratio = d.width / d.height / (p.width / p.height);
    if (ratio > 0.9 && ratio < 1.1) matched++;
  });
  return compared === 0 || matched / compared >= 0.8;
}

const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/**
 * Google ドキュメントを「ウェブページ(.html、zip 圧縮)」で書き出したファイルを読む。
 * Word と違い、図形描画で描いた図も画像として入っている。書式は style 属性にあるので、
 * 太字(font-weight 600 以上)を <strong> に、Google の転送 URL を元の URL に戻してから、Word と同じ読み方をする。
 */
export async function importGoogleZip(buffer: Buffer, known?: KnownImages): Promise<ImportResult> {
  const { body, imageFile } = readGooglePage(buffer);
  const collector = createImageCollector(known);
  const imageSizes: (ImageSize | null)[] = [];
  for (const img of body.querySelectorAll("img")) {
    const { data, contentType } = imageFile(img);
    imageSizes.push(data && contentType ? await sizeOf(data) : null);
    const id = data ? await collector.add(data, contentType) : "";
    if (!id && data && contentType) collector.countBlank();
    img.setAttribute("src", id ? IMAGE_SRC_PREFIX + id : "");
  }
  for (const span of body.querySelectorAll("span")) {
    const weight = /font-weight:\s*(\d+)/.exec(span.getAttribute("style") ?? "")?.[1];
    if (weight && Number(weight) >= 600) span.replaceWith(`<strong>${span.innerHTML}</strong>`);
  }
  for (const a of body.querySelectorAll("a")) {
    const href = a.getAttribute("href") ?? "";
    const m = /^https:\/\/www\.google\.com\/url\?q=([^&]+)/.exec(href);
    if (m) a.setAttribute("href", decodeURIComponent(m[1]));
  }
  // 段落の頭の空白(&nbsp; と半角スペース)は、Word の書き出しと同じ全角スペースの字下げにする。
  for (const p of body.querySelectorAll("p")) {
    let first: Node | undefined = p.firstChild ?? undefined;
    while (first && isElement(first)) first = first.firstChild ?? undefined;
    if (!first || first.nodeType !== NodeType.TEXT_NODE) continue;
    const text = first.rawText.replace(/&nbsp;/g, "\u00a0");
    const lead = /^[\u00a0 ]+/.exec(text)?.[0] ?? "";
    if (lead.length >= 2 && text.length > lead.length) first.rawText = "\u3000".repeat(lead.length) + text.slice(lead.length);
  }
  return finish(body.innerHTML, collector, [], imageSizes);
}

/** ウェブページの書き出しの本文(コメントを除いたもの)と、img から画像のファイルを引く関数。 */
function readGooglePage(buffer: Buffer) {
  const files = readZip(buffer);
  const htmlName = [...files.keys()].find((name) => /\.html?$/i.test(name));
  if (!htmlName)
    throw new Error("zip の中に .html がありません。Google ドキュメントの「ウェブページ」で書き出したものを使ってください。");
  const root = parse(files.get(htmlName)!.toString("utf8"));
  const body = root.querySelector("body") ?? root;
  const dir = htmlName.includes("/") ? htmlName.slice(0, htmlName.lastIndexOf("/") + 1) : "";

  // コメント(本文の [a] などの印と、末尾のコメントの本文)は、教科書の中身ではないので除く。
  for (const a of body.querySelectorAll('a[href^="#cmnt"]')) {
    const holder = a.closest("div") ?? (a.parentNode?.rawTagName === "sup" ? a.parentNode : a);
    holder.remove();
  }
  const imageFile = (img: HTMLElement): { data: Buffer | undefined; contentType: string } => {
    const src = decodeURIComponent(img.getAttribute("src") ?? "");
    return {
      data: files.get(dir + src) ?? files.get(src),
      contentType: EXTENSION_TYPES[src.split(".").pop()?.toLowerCase() ?? ""] ?? "",
    };
  };
  return { body, imageFile };
}

/** ウェブページの書き出しの画像を、文書に出てくる順に取り出す(Word で空になった図形描画を埋めるため)。 */
export async function listGooglePageImages(buffer: Buffer): Promise<(PageImage | null)[]> {
  const { body, imageFile } = readGooglePage(buffer);
  const out: (PageImage | null)[] = [];
  for (const img of body.querySelectorAll("img")) {
    const { data, contentType } = imageFile(img);
    out.push(data && contentType ? { data, contentType, size: await sizeOf(data) } : null);
  }
  return out;
}

/** zip を読む(保存と deflate だけ。Google ドキュメントの書き出しはこれで足りる)。 */
export function readZip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("zip として読めません。");
  const count = buffer.readUInt16LE(end + 10);
  let pos = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) throw new Error("zip の目次が壊れています。");
    const method = buffer.readUInt16LE(pos + 10);
    const size = buffer.readUInt32LE(pos + 20);
    const nameLength = buffer.readUInt16LE(pos + 28);
    const extraLength = buffer.readUInt16LE(pos + 30);
    const commentLength = buffer.readUInt16LE(pos + 32);
    const local = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString("utf8", pos + 46, pos + 46 + nameLength);
    pos += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(dataStart, dataStart + size);
    if (method === 0) files.set(name, Buffer.from(raw));
    else if (method === 8) files.set(name, inflateRawSync(raw));
  }
  return files;
}

// ---- HTML → 部品 ------------------------------------------------------------------

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === NodeType.ELEMENT_NODE;
}

function tagOf(node: Node): string {
  return isElement(node) ? (node.rawTagName?.toLowerCase() ?? "") : "";
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
  // 行頭の全角スペースは、続きの行をそろえる字下げなので残す(「手順2)」の次の行など)。
  while (inlines.length && !inlines[0].text.trim()) inlines.shift();
  while (inlines.length && !inlines[inlines.length - 1].text.trim()) inlines.pop();
  if (inlines.length) {
    inlines[0].text = inlines[0].text.replace(/^[ \t\r\n]+/, "");
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

function spanOf(cell: HTMLElement, name: "rowspan" | "colspan"): number {
  const n = Number(cell.getAttribute(name) ?? 1);
  return Number.isInteger(n) && n > 1 ? Math.min(n, 50) : 1;
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
      const spans: CellSpan[] = [];
      for (const tr of node.querySelectorAll("tr")) {
        // 入れ子の表の行は、その表の中で扱う。
        if (tr.closest("table") !== node) continue;
        const cells = tr.childNodes.filter((c): c is HTMLElement => tagOf(c) === "td" || tagOf(c) === "th");
        const converted = cells.map((cell) => convertNodes(cell.childNodes, ctx, true));
        // 中身のない行は捨てる(縦に結合したセルが掛かる行は、表の形を保つために残す)。
        const covered = spans.some((s) => s.row + s.rowSpan > rows.length);
        if (!covered && !converted.some((c) => c.length > 0)) continue;
        cells.forEach((cell, i) => {
          const rowSpan = spanOf(cell, "rowspan");
          const colSpan = spanOf(cell, "colspan");
          if (rowSpan > 1 || colSpan > 1) spans.push({ row: rows.length, cell: i, rowSpan, colSpan });
        });
        rows.push(converted);
      }
      if (rows.length) blocks.push(spans.length ? { type: "table", rows, spans } : { type: "table", rows });
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
