import { Fragment, type ReactNode } from "react";
import type { Block, Inline } from "../content";
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
        2: "text-brand01 border-brand03 mt-6 border-l-4 pl-3 text-xl font-bold",
        3: "text-brand01 mt-4 text-lg font-bold",
        4: "text-brand01 mt-2 font-bold",
      }[block.level];
      const Tag = (["h2", "h3", "h4"] as const)[block.level - 2];
      return (
        <Tag id={block.id} className={`${style} scroll-mt-20 ${PHRASE_WRAP}`}>
          <Phrased text={cleanText(block.text).replace(/\*\*/g, "")} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className={`${PROSE} ${compact ? "text-sm leading-relaxed" : "leading-[1.9]"}`}>
          <InlineText inlines={block.inlines} />
        </p>
      );
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
                  {row.map((cell, c) => (
                    <td key={c} className="border-brand01/20 min-w-[4.5rem] border px-3 py-2 align-top">
                      <div className="flex flex-col gap-2">
                        {cell.map((b, i) => (
                          <BlockView key={i} block={b} quizKey={`${quizKey}-t${r}-${c}-${i}`} compact />
                        ))}
                      </div>
                    </td>
                  ))}
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

/** 章の本文。quizKey はテストの結果を端末に保存するときの名前の頭(教科書・章ごとに一意)。 */
export function Blocks({ blocks, quizKey }: { blocks: Block[]; quizKey: string }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} quizKey={`${quizKey}-${i}`} compact={false} />
      ))}
    </div>
  );
}
