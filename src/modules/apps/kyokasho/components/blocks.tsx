import { Fragment, type ReactNode } from "react";
import type { Block, CellSpan, Inline } from "../content";
import {
  flowCell,
  groupImages,
  isLabel,
  joinBrokenLines,
  tableCards,
  tableKind,
} from "../layout";
import { cleanText, phrases, softenLines, splitBold } from "../typeset";
import { Quiz } from "./quiz";

// 教科書の中身(content.ts の部品)を描く。画像は /apps/kyokasho/images/<id>(見られる人だけに、R2 の署名付き URL へ転送)。

// 文節の区切り(<wbr>)でだけ折り返す。長い英数字だけは、はみ出さないよう途中でも折る。
export const PHRASE_WRAP = "[word-break:keep-all] [overflow-wrap:anywhere]";
// 本文は 1 行が長すぎないように(和文で 1 行おおむね 40 字)。
const PROSE = `font-prose text-ink max-w-[40em] ${PHRASE_WRAP}`;
// 写真・図の枠(続く写真は、この枠をそろえて並べる)。
const FRAME = "border-brand01/10 rounded-sm border bg-white";

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
        // 紙の幅に合わせて手で入れた改行(「安全装置が/ついていないため」)はつなぎ、画面の幅で折り返す。
        const lines = softenLines(cleanText(part.text)).split("\n");
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
        const body = part.bold ? (
          <strong className="font-bold">{text}</strong>
        ) : (
          text
        );
        const shown = part.href ? linkLabel(part.text, part.href) : null;
        if (part.href && shown) {
          return (
            <a
              key={i}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link border-link/40 mx-0.5 inline-flex items-center gap-1 rounded-sm border bg-white px-2 py-0.5 text-sm font-bold hover:opacity-80"
            >
              {shown}
              <span aria-hidden>›</span>
            </a>
          );
        }
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

/**
 * リンクの見せ方。文字が URL そのもの・ファイル名だけのリンクは読みにくいので、短い名前のボタンにする
 * (「https://www.youtube.com/watch?v=…」→「YouTube で見る」、「IMG_7472.HEIC」→「写真を開く」)。それ以外は null(文字のまま)。
 */
function linkLabel(text: string, href: string): string | null {
  const t = text.trim();
  let host = "";
  try {
    host = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  if (/\.(heic|heif|jpe?g|png|gif|webp)$/i.test(t)) return "写真を開く";
  if (/\.(mov|mp4|m4v)$/i.test(t)) return "動画を開く";
  if (/\.(pdf|xlsx?|docx?|pptx?)$/i.test(t)) return "ファイルを開く";
  if (!/^https?:\/\//i.test(t)) return null;
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return "YouTube で見る";
  return `${host} を開く`;
}

function BlockView({
  block,
  quizKey,
  compact,
}: {
  block: Block;
  quizKey: string;
  compact: boolean;
}) {
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
      const inlines = indent
        ? [
            { ...first, text: first.text.slice(indent) },
            ...block.inlines.slice(1),
          ]
        : block.inlines;
      const pad =
        indent === 0 ? "" : indent === 1 ? "pl-[1em]" : "pl-[2em] md:pl-[4em]";
      return (
        <p
          className={`${PROSE} ${compact ? "text-sm leading-relaxed" : "leading-[1.9]"} ${pad}`}
        >
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
          className={`${FRAME} h-auto max-w-full ${compact ? "max-h-72" : "max-h-[32rem]"} w-auto self-start object-contain`}
        />
      );
    case "table":
      return <TableView block={block} quizKey={quizKey} />;
    case "quiz":
      return <Quiz questions={block.questions} storageKey={quizKey} />;
  }
}

function findSpan(
  spans: CellSpan[] | undefined,
  row: number,
  cell: number,
): CellSpan | undefined {
  return spans?.find((s) => s.row === row && s.cell === cell);
}

type TableBlock = Extract<Block, { type: "table" }>;

/**
 * 表。元の文書は紙の幅に合わせた表なので、スマホでは見せ方を変える(docs/DESIGN.md 30 章)。
 * セル 1 つの表は囲み、見出しの行がある表はスマホでは 1 行ずつのカード、縦につながったセルがある表は横に動かせる表。
 */
function TableView({ block, quizKey }: { block: TableBlock; quizKey: string }) {
  const kind = tableKind(block);
  if (kind === "callout") {
    return (
      <div className="bg-bg01 border-brand01/40 max-w-[44em] rounded-sm border-l-4 px-4 py-3">
        <BlockList
          blocks={flowCell(block.rows[0][0])}
          quizKey={`${quizKey}-c`}
          compact
        />
      </div>
    );
  }
  const table = <GridTable block={block} quizKey={quizKey} />;
  if (kind === "table") return table;
  return (
    <>
      <div className="flex flex-col gap-3 sm:hidden">
        {tableCards(block).map((card, i) => (
          <section
            key={i}
            className="border-brand01/15 overflow-hidden rounded-md border bg-white"
          >
            <CardTitle blocks={card.title} quizKey={`${quizKey}-k${i}`} />
            {card.fields.length ? (
              <dl className="flex flex-col">
                {card.fields.map((field, j) => {
                  // 短い中身(役職・判定・空欄など)は項目名の右に、長い文や写真は項目名の下に置く。
                  const side = isShort(field.value);
                  return (
                    <div
                      key={j}
                      className={`${side ? "grid grid-cols-[5.5em_1fr] items-baseline gap-x-3" : "flex flex-col gap-1"} px-4 py-2.5 ${j === 0 ? "" : field.divider ? "border-brand01/25 border-t-2" : "border-brand01/10 border-t"}`}
                    >
                      {field.label.length ? (
                        <dt className="text-brand04/70 text-xs font-bold">
                          <BlockList
                            blocks={flowCell(field.label)}
                            quizKey={`${quizKey}-k${i}-l${j}`}
                            compact
                            plain
                          />
                        </dt>
                      ) : null}
                      <dd
                        className={
                          field.label.length || !side
                            ? "min-w-0"
                            : "col-span-2 min-w-0"
                        }
                      >
                        {field.value.length ? (
                          <BlockList
                            blocks={flowCell(field.value)}
                            quizKey={`${quizKey}-k${i}-v${j}`}
                            compact
                          />
                        ) : (
                          // 元の表の空欄(氏名を書き込む欄など)。空いていることが分かるように残す。
                          <span
                            className="border-brand04/30 block h-6 border-b border-dashed"
                            aria-label="空欄"
                          />
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}
          </section>
        ))}
      </div>
      <div className="hidden sm:block">{table}</div>
    </>
  );
}

/** 項目名の右に並べられるほど短い中身か(文字だけで 16 字まで)。 */
function isShort(blocks: Block[]): boolean {
  if (blocks.some((b) => b.type !== "paragraph")) return false;
  const length = blocks.reduce(
    (n, b) =>
      n +
      (b.type === "paragraph"
        ? b.inlines.reduce((m, i) => m + i.text.trim().length, 0)
        : 0),
    0,
  );
  return length <= 16;
}

/**
 * カードの題(表の 1 列目)。写真は小さくせず、カードの幅いっぱいに見せる(押すと元の大きさで開く)。
 * 文字があれば、写真の上に題として置く。
 */
function CardTitle({ blocks, quizKey }: { blocks: Block[]; quizKey: string }) {
  const images = blocks.flatMap((b) => (b.type === "image" ? [b.id] : []));
  const text = flowCell(blocks.filter((b) => b.type !== "image"));
  return (
    <div className="bg-bg01 flex flex-col">
      {text.length ? (
        <div className="text-brand01 px-4 py-2.5 font-bold">
          <BlockList blocks={text} quizKey={quizKey} compact />
        </div>
      ) : null}
      {images.length ? (
        <div
          className={`grid gap-1 bg-white ${images.length > 1 ? "grid-cols-2" : ""}`}
        >
          {images.map((id) => (
            <a
              key={id}
              href={imageUrl(id)}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl(id)}
                alt=""
                loading="lazy"
                className="mx-auto h-auto max-h-80 w-full object-contain"
              />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GridTable({ block, quizKey }: { block: TableBlock; quizKey: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <table className="border-brand01/20 w-full min-w-[32rem] border-collapse border bg-white text-sm">
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r} className={r === 0 ? "bg-bg01" : ""}>
              {row.map((cell, c) => {
                const span = findSpan(block.spans, r, c);
                return (
                  <td
                    key={c}
                    rowSpan={span?.rowSpan}
                    colSpan={span?.colSpan}
                    className={`border-brand01/20 min-w-[4.5rem] border px-3 py-2 align-top ${r === 0 ? "text-brand01 font-bold" : ""}`}
                  >
                    <BlockList
                      blocks={flowCell(cell)}
                      quizKey={`${quizKey}-t${r}-${c}`}
                      compact
                    />
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

// 並べる数に合わせた列の数(3 枚なら 3 列にして、1 枚だけ下に残らないようにする)。
function gridCols(count: number, compact: boolean): string {
  if (compact) return count === 3 ? "grid-cols-3" : "grid-cols-2";
  if (count === 3) return "grid-cols-3";
  if (count === 4) return "grid-cols-2 sm:grid-cols-4";
  return "grid-cols-2 sm:grid-cols-3";
}

/** 続く写真・図。同じ大きさの枠にそろえて並べる(押すと元の大きさで開く)。 */
function ImageGrid({ ids, compact }: { ids: string[]; compact: boolean }) {
  return (
    <div className={`grid max-w-[44em] gap-2 ${gridCols(ids.length, compact)}`}>
      {ids.map((id) => (
        <a
          key={id}
          href={imageUrl(id)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${FRAME} block p-1`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(id)}
            alt=""
            loading="lazy"
            className="aspect-[4/3] h-auto w-full object-contain"
          />
        </a>
      ))}
    </div>
  );
}

/**
 * 部品の前の空き。元の文書は 1 行ずつが別の段落なので、段落が続くところは詰めて、文として読めるようにする。
 * 見出し・表・画像・区切りの行の前は空ける。
 */
function spaceBefore(
  prev: Block | undefined,
  block: Block,
  compact: boolean,
): string {
  if (!prev) return "";
  if (compact)
    return block.type === "paragraph" &&
      prev.type === "paragraph" &&
      !isLabel(block)
      ? "mt-0.5"
      : "mt-2";
  if (block.type === "heading")
    return { 2: "mt-10", 3: "mt-7", 4: "mt-5" }[block.level];
  if (prev.type === "heading") return "mt-3";
  if (block.type === "paragraph" && prev.type === "paragraph")
    return isLabel(block) ? "mt-6" : "mt-1.5";
  if (block.type === "image" && prev.type === "paragraph") return "mt-2";
  return "mt-5";
}

function BlockList({
  blocks,
  quizKey,
  compact,
  plain = false,
}: {
  blocks: Block[];
  quizKey: string;
  compact: boolean;
  /** 項目名など、本文の書体・色を当てない小さな見出し。 */
  plain?: boolean;
}) {
  const placed = groupImages(compact ? blocks : joinBrokenLines(blocks));
  return (
    <div className="flex flex-col">
      {placed.map((item, i) => {
        const prev = placed[i - 1];
        const prevBlock = prev
          ? prev.kind === "block"
            ? prev.block
            : ({ type: "image", id: "", alt: "" } as Block)
          : undefined;
        if (item.kind === "images") {
          return (
            <div
              key={i}
              className={prevBlock ? (compact ? "mt-2" : "mt-4") : ""}
            >
              <ImageGrid ids={item.ids} compact={compact} />
            </div>
          );
        }
        if (plain && item.block.type === "paragraph") {
          return (
            <span key={i} className={PHRASE_WRAP}>
              <InlineText inlines={item.block.inlines} />
            </span>
          );
        }
        return (
          <div
            key={i}
            className={`flex flex-col ${spaceBefore(prevBlock, item.block, compact)}`}
          >
            {/* テストの結果を端末に保存する名前は、元の並びの番号で作る(つないだ行・まとめた写真で番号がずれないように) */}
            <BlockView
              block={item.block}
              quizKey={`${quizKey}-${blocks.indexOf(item.block)}`}
              compact={compact}
            />
          </div>
        );
      })}
    </div>
  );
}

/** 章の本文。quizKey はテストの結果を端末に保存するときの名前の頭(教科書・章ごとに一意)。 */
export function Blocks({
  blocks,
  quizKey,
}: {
  blocks: Block[];
  quizKey: string;
}) {
  return <BlockList blocks={blocks} quizKey={quizKey} compact={false} />;
}
