import { Fragment, type ReactNode } from "react";
import type { Block, Inline } from "../content";
import { Quiz } from "./quiz";

// 教科書の中身(content.ts の部品)を描く。画像は /apps/kyokasho/images/<id>(見られる人だけに、R2 の署名付き URL へ転送)。

export function imageUrl(id: string): string {
  return `/apps/kyokasho/images/${id}`;
}

function InlineText({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((part, i) => {
        const lines = part.text.split("\n");
        const text: ReactNode = lines.map((line, j) => (
          <Fragment key={j}>
            {j > 0 ? <br /> : null}
            {line}
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
        <Tag id={block.id} className={`${style} scroll-mt-20 [word-break:auto-phrase]`}>
          {block.text}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className={`text-brand01 leading-relaxed ${compact ? "text-sm" : ""}`}>
          <InlineText inlines={block.inlines} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={`text-brand01 flex flex-col gap-1 pl-6 leading-relaxed ${block.ordered ? "list-decimal" : "list-disc"} ${compact ? "text-sm" : ""}`}
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
