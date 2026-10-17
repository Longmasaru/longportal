import { Fragment, type ReactNode } from "react";
import type { Block, CellSpan, Inline } from "../content";
import { cleanText, phrases, splitBold } from "../typeset";
import { Quiz } from "./quiz";

// 教科書の中身(content.ts の部品)を描く。画像は /apps/kyokasho/images/<id>(見られる人だけに、R2 の署名付き URL へ転送)。

// 文節の区切り(<wbr>)でだけ折り返す。長い英数字だけは、はみ出さないよう途中でも折る。
export const PHRASE_WRAP = "[word-break:keep-all] [overflow-wrap:anywhere]";
// 本文は 1 行が長すぎないように(和文で 1 行おおむね 40 字)。
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
    case "quiz":
      return <Quiz questions={block.questions} storageKey={quizKey} />;
  }
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

function BlockList({ blocks, quizKey, compact }: { blocks: Block[]; quizKey: string; compact: boolean }) {
  return (
    <div className="flex flex-col">
      {blocks.map((block, i) => (
        <div key={i} className={`flex flex-col ${spaceBefore(blocks[i - 1], block, compact)}`}>
          <BlockView block={block} quizKey={`${quizKey}-${i}`} compact={compact} />
        </div>
      ))}
    </div>
  );
}

/** 章の本文。quizKey はテストの結果を端末に保存するときの名前の頭(教科書・章ごとに一意)。 */
export function Blocks({ blocks, quizKey }: { blocks: Block[]; quizKey: string }) {
  return <BlockList blocks={blocks} quizKey={quizKey} compact={false} />;
}
