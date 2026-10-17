import { Fragment, type ReactNode } from "react";
import type { Block, CellSpan, Inline } from "../content";
import { cleanText, isSoftBreak, joinLines, phrases, softenLines, splitBold } from "../typeset";
import { Quiz } from "./quiz";

// 教科書の中身(content.ts の部品)を描く。画像は /apps/kyokasho/images/<id>(見られる人だけに、R2 の署名付き URL へ転送)。

// 文節の区切り(<wbr>)でだけ折り返す。長い英数字だけは、はみ出さないよう途中でも折る。
export const PHRASE_WRAP = "[word-break:keep-all] [overflow-wrap:anywhere]";
// 本文は 1 行が長すぎないように(和文で 1 行おおむね 40 字)。
// 本文の書体。ポータルの Zen Kaku Gothic は、かなを詰める設定(palt)が効かず、長い文では字の間が空いて見える。
// 教科書の本文だけ、端末の読みやすい書体(iPhone・Mac はヒラギノ、Windows は BIZ UDP ゴシック)にする。
export const READING_FONT =
  "[font-family:\"Hiragino_Sans\",\"Hiragino_Kaku_Gothic_ProN\",\"BIZ_UDPGothic\",\"Noto_Sans_JP\",\"Yu_Gothic_UI\",Meiryo,sans-serif]";
const PROSE = `text-ink max-w-[40em] ${PHRASE_WRAP}`;

export function imageUrl(id: string): string {
  return `/apps/kyokasho/images/${id}`;
}

/** 文節の区切りに <wbr> を入れる(PHRASE_WRAP と組み合わせて、語の途中で改行させない)。 */
export function Phrased({ text }: { text: string }) {
  return (
    <>
      {phrases(text).map((p, i) => (
        <Fragment key={i}>
          {i > 0 ? <wbr /> : null}
          {p}
        </Fragment>
      ))}
    </>
  );
}

function InlineText({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((part, i) => {
        const lines = cleanText(part.text).split("\n");
        const text: ReactNode = lines.map((line, j) => (
          <Fragment key={j}>
            {j > 0 ? <br /> : null}
            {splitBold(line).map((seg, k) =>
              seg.bold && !part.bold ? (
                <strong key={k} className="font-bold">
                  <Phrased text={seg.text} />
                </strong>
              ) : (
                <Phrased key={k} text={seg.text} />
              ),
            )}
          </Fragment>
        ));
        const body = part.bold ? <strong className="font-bold">{text}</strong> : text;
        return part.href ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link underline underline-offset-2 [word-break:break-all] hover:opacity-80"
          >
            {body}
          </a>
        ) : (
          <Fragment key={i}>{body}</Fragment>
        );
      })}
    </>
  );
}

function BlockView({ block, quizKey, compact }: { block: Block; quizKey: string; compact: boolean }) {
  switch (block.type) {
    case "heading": {
      const style = {
        2: "text-brand01 border-brand03 border-l-4 pl-3 text-xl font-bold",
        3: "text-brand01 text-lg font-bold",
        4: "text-brand01 font-bold",
      }[block.level];
      const Tag = (["h2", "h3", "h4"] as const)[block.level - 2];
      return (
        <Tag id={block.id} className={`${style} scroll-mt-20 ${PHRASE_WRAP}`}>
          <Phrased text={cleanText(block.text).replace(/\*\*/g, "")} />
        </Tag>
      );
    }
    case "paragraph": {
      // 行頭の全角スペース(続きの行をそろえる字下げ)は、余白にする(スマホで折り返しても、そろったままになる)。
      const first = block.inlines[0];
      const indent = first ? (first.text.match(/^　+/)?.[0].length ?? 0) : 0;
      const inlines = indent ? [{ ...first, text: first.text.slice(indent) }, ...block.inlines.slice(1)] : block.inlines;
      const pad = indent === 0 ? "" : indent === 1 ? "pl-[1em]" : "pl-[2em] md:pl-[4em]";
      return (
        <p className={`${PROSE} ${compact ? "text-sm leading-relaxed" : "leading-[1.9]"} ${pad}`}>
          <InlineText inlines={inlines} />
        </p>
      );
    }
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={`${PROSE} flex flex-col gap-1.5 pl-6 ${block.ordered ? "list-decimal" : "list-disc"} ${compact ? "text-sm leading-relaxed" : "leading-[1.9]"}`}
        >
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineText inlines={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "image":
      return (
        // R2 の署名付き URL へ転送する住所なので、next/image の最適化は使わない。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl(block.id)}
          alt={block.alt}
          loading="lazy"
          className={`border-brand01/10 h-auto max-w-full border bg-white ${compact ? "max-h-64" : "max-h-[32rem]"} w-auto self-start object-contain`}
        />
      );
    case "table":
      return <TableView block={block} quizKey={quizKey} />;
    case "quiz":
      return <Quiz questions={block.questions} storageKey={quizKey} />;
  }
}

type TableBlock = Extract<Block, { type: "table" }>;

/** 表の見せ方を、形で選ぶ(スマホで横にはみ出さないように)。 */
function TableView({ block, quizKey }: { block: TableBlock; quizKey: string }) {
  const rows = block.rows.map((row) => row.map(prepareCell));
  const cols = Math.max(...rows.map((r) => r.length));
  const spanned = (block.spans?.length ?? 0) > 0;

  // 1 列だけの表(枠で囲んだ説明など)は、枠の箱にする。
  if (cols === 1 && !spanned) {
    return (
      <div className="flex flex-col gap-3">
        {rows.map((row, r) =>
          row[0].length ? (
            <div key={r} className="border-brand01/20 bg-bg01 border px-4 py-3">
              <BlockList blocks={row[0]} quizKey={`${quizKey}-t${r}`} compact />
            </div>
          ) : null,
        )}
      </div>
    );
  }

  const grid = <GridTable block={block} rows={rows} quizKey={quizKey} />;
  const cards = (rows.length >= 2 ? toCards(rows, block.spans) : null) ?? stackedCards(rows);
  // 見出しの行がある表は、スマホでは 1 件ずつのカードにする(表の形のままだと右が切れる)。
  return (
    <>
      <div className="flex flex-col gap-3 md:hidden">
        {cards.map((card, i) => (
          <div key={i} className="border-brand01/20 border bg-white">
            {card.title ? (
              <div className="bg-bg01 border-brand01/20 border-b px-4 py-2.5">
                {card.title.label ? (
                  <p className="text-brand01 mb-0.5 text-xs font-bold">{card.title.label}</p>
                ) : null}
                <div className="font-bold">
                  <BlockList blocks={card.title.blocks} quizKey={`${quizKey}-m${i}-0`} compact />
                </div>
              </div>
            ) : null}
            {card.items.length ? (
              <div className="flex flex-col gap-3 px-4 py-3">
                {card.items.map((item, j) => (
                  <div key={j} className={item.divider ? "border-brand01/15 border-t pt-3" : ""}>
                    {item.label ? <p className="text-brand01 mb-1 text-xs font-bold">{item.label}</p> : null}
                    <BlockList blocks={item.blocks} quizKey={`${quizKey}-m${i}-${j + 1}`} compact />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="hidden md:block">{grid}</div>
    </>
  );
}

type CardPart = { label: string; blocks: Block[]; divider?: boolean };

/** 見出しの行として扱えない表(写真を並べた表など)は、行ごとに、セルを縦に並べる。 */
function stackedCards(rows: Block[][][]): Card[] {
  return rows
    .map((row) => ({ title: null, items: row.filter((c) => c.length).map((blocks) => ({ label: "", blocks })) }))
    .filter((c) => c.items.length);
}
type Card = { title: CardPart | null; items: CardPart[] };

/**
 * 1 行目を見出しとして、表を 1 件ずつのカードにする。結合したセルも、表と同じ位置(列)として扱う。
 * 1 列目が縦に結合しているときは、その行をまとめて 1 枚のカードにする(「太い実線」の役割とポイントなど)。
 * 見出しの行が縦に結合しているなど、カードにしにくい表は null(表のまま)。
 */
function toCards(rows: Block[][][], spans: CellSpan[] | undefined): Card[] | null {
  type Ref = { r: number; c: number; col: number; colSpan: number };
  const grid: Ref[][] = rows.map(() => []);
  rows.forEach((row, r) => {
    let col = 0;
    row.forEach((_, c) => {
      while (grid[r][col]) col++;
      const span = findSpan(spans, r, c);
      const ref = { r, c, col, colSpan: span?.colSpan ?? 1 };
      for (let rr = r; rr < Math.min(rows.length, r + (span?.rowSpan ?? 1)); rr++) {
        for (let cc = col; cc < col + ref.colSpan; cc++) grid[rr][cc] = ref;
      }
      col += ref.colSpan;
    });
  });
  if (grid[0].some((ref) => ref && ref.r === 0 && (findSpan(spans, 0, ref.c)?.rowSpan ?? 1) > 1)) return null;
  const headerText = grid[0].map((ref) => (ref ? cellLabel(rows[0][ref.c]) : ""));
  const label = (ref: Ref) =>
    [...new Set(headerText.slice(ref.col, ref.col + ref.colSpan).filter(Boolean))].join("・");

  const cards: Card[] = [];
  for (let r = 1; r < rows.length; r++) {
    const first = grid[r][0];
    // 1 列目が上の行から縦に続いているときは、上のカードに足す。
    const continued = first !== undefined && first.r < r && cards.length > 0;
    const card: Card = continued ? cards[cards.length - 1] : { title: null, items: [] };
    if (!continued) cards.push(card);
    const seen = new Set<Ref>();
    let firstOfRow = continued;
    for (const ref of grid[r]) {
      // 縦に結合したセルは、最初の行でだけ出す。横に結合したセルは 1 回だけ。
      if (!ref || ref.r < r || seen.has(ref)) continue;
      seen.add(ref);
      const blocks = rows[ref.r][ref.c];
      if (!blocks.length) continue;
      const part = { label: label(ref), blocks };
      if (ref === first) card.title = part;
      else {
        card.items.push(firstOfRow ? { ...part, divider: true } : part);
        firstOfRow = false;
      }
    }
  }
  return cards.filter((c) => c.title || c.items.length);
}


function GridTable({ block, rows, quizKey }: { block: TableBlock; rows: Block[][][]; quizKey: string }) {
  return (
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <table className="border-brand01/20 w-full min-w-[32rem] border-collapse border bg-white text-sm">
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className={r === 0 ? "bg-bg01" : ""}>
                  {row.map((cell, c) => {
                    const span = findSpan(block.spans, r, c);
                    return (
                      <td
                        key={c}
                        rowSpan={span?.rowSpan}
                        colSpan={span?.colSpan}
                        className="border-brand01/20 min-w-[4.5rem] border px-3 py-2 align-top"
                      >
                        <BlockList blocks={cell} quizKey={`${quizKey}-t${r}-${c}`} compact />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
  );
}

/** 文字だけを取り出す(カードの見出しに使う)。 */
function cellLabel(cell: Block[]): string {
  return cell
    .map((b) =>
      b.type === "paragraph" ? b.inlines.map((i) => i.text).join("") : b.type === "heading" ? b.text : "",
    )
    .join(" ")
    .replace(/\*\*/g, "")
    .trim();
}

/**
 * 表のセルの中身を整える。狭い列に収めるために手で入れた改行と字下げを外し、画面の幅で折り返させる
 * (「火花が|散って|引火する」→「火花が散って引火する」)。
 */
function prepareCell(cell: Block[]): Block[] {
  const out: Block[] = [];
  for (const block of cell) {
    if (block.type !== "paragraph") {
      out.push(block);
      continue;
    }
    const inlines = block.inlines.map((i) => ({ ...i, text: softenLines(cleanText(i.text)) }));
    inlines[0] = { ...inlines[0], text: inlines[0].text.replace(/^[ 　]+/, "") };
    const prev = out[out.length - 1];
    if (prev?.type === "paragraph" && !isLabel(block)) {
      const last = prev.inlines[prev.inlines.length - 1];
      if (isSoftBreak(last.text.split("\n").at(-1) ?? "", inlines[0].text)) {
        const joined = joinLines(last.text, inlines[0].text);
        if (Boolean(last.bold) === Boolean(inlines[0].bold) && last.href === inlines[0].href) {
          prev.inlines = [...prev.inlines.slice(0, -1), { ...last, text: joined }, ...inlines.slice(1)];
        } else {
          prev.inlines = [...prev.inlines, ...inlines];
        }
        continue;
      }
    }
    out.push({ type: "paragraph", inlines });
  }
  return out;
}

function findSpan(spans: CellSpan[] | undefined, row: number, cell: number): CellSpan | undefined {
  return spans?.find((s) => s.row === row && s.cell === cell);
}

/** 区切りの 1 行(全体が太字、または ▼・■・【 などで始まる)。前を空けて、まとまりの境目にする。 */
function isLabel(block: Block): boolean {
  if (block.type !== "paragraph" || block.inlines.length === 0) return false;
  if (block.inlines.every((i) => i.bold)) return true;
  return /^[▼■◆●【≪《]/.test(block.inlines[0].text);
}

/**
 * 部品の前の空き。元の文書は 1 行ずつが別の段落なので、段落が続くところは詰めて、文として読めるようにする。
 * 見出し・表・画像・区切りの行の前は空ける。
 */
function spaceBefore(prev: Block | undefined, block: Block, compact: boolean): string {
  if (!prev) return "";
  if (compact) return block.type === "paragraph" && prev.type === "paragraph" && !isLabel(block) ? "mt-0.5" : "mt-2";
  if (block.type === "heading") return { 2: "mt-10", 3: "mt-7", 4: "mt-5" }[block.level];
  if (prev.type === "heading") return "mt-3";
  if (block.type === "paragraph" && prev.type === "paragraph") return isLabel(block) ? "mt-6" : "mt-1.5";
  if (block.type === "image" && prev.type === "paragraph") return "mt-2";
  return "mt-5";
}

type ImageBlock = Extract<Block, { type: "image" }>;

/** 続けて並んだ写真は、縦に小さく積まずに、並べて見せる(スマホは 2 列、PC は 3 列)。 */
function Gallery({ images }: { images: ImageBlock[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {images.map((image) => (
        <a
          key={image.id}
          href={imageUrl(image.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="border-brand01/10 flex items-center justify-center border bg-white p-1"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl(image.id)} alt={image.alt} loading="lazy" className="h-auto max-h-60 w-full object-contain" />
        </a>
      ))}
    </div>
  );
}

/** 続けて並んだ写真(2 枚以上)を 1 つにまとめる。 */
// index は元の並びでの位置(テストの結果を端末に保存するときの名前に使うので、まとめても変えない)。
function groupImages(blocks: Block[]): { index: number; item: Block | ImageBlock[] }[] {
  const out: { index: number; item: Block | ImageBlock[] }[] = [];
  blocks.forEach((block, index) => {
    const last = out[out.length - 1]?.item;
    if (block.type === "image" && Array.isArray(last)) last.push(block);
    else if (block.type === "image" && last && !Array.isArray(last) && last.type === "image") {
      out[out.length - 1].item = [last, block];
    } else out.push({ index, item: block });
  });
  return out;
}

function BlockList({ blocks, quizKey, compact }: { blocks: Block[]; quizKey: string; compact: boolean }) {
  const items = groupImages(blocks);
  return (
    <div className="flex flex-col">
      {items.map(({ index, item }, i) => {
        const prev = items[i - 1]?.item;
        const prevBlock = Array.isArray(prev) ? prev[prev.length - 1] : prev;
        const block = Array.isArray(item) ? item[0] : item;
        return (
          <div key={index} className={`flex flex-col ${spaceBefore(prevBlock, block, compact)}`}>
            {Array.isArray(item) ? (
              <Gallery images={item} />
            ) : (
              <BlockView block={item} quizKey={`${quizKey}-${index}`} compact={compact} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 章の本文。quizKey はテストの結果を端末に保存するときの名前の頭(教科書・章ごとに一意)。 */
export function Blocks({ blocks, quizKey }: { blocks: Block[]; quizKey: string }) {
  return (
    <div className={READING_FONT}>
      <BlockList blocks={blocks} quizKey={quizKey} compact={false} />
    </div>
  );
}
