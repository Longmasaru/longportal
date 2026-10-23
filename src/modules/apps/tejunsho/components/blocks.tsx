import type { ReactNode } from "react";
import type { Block } from "../types";

// 手順書の本文の部品(types.ts の Block)を描く。

/** 「」で囲んだ語(ボタン名・メニュー名)を太字にする。 */
export function Emphasized({ text }: { text: string }) {
  const parts = text.split(/(「[^」]+」)/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("「") && part.endsWith("」") ? (
          <strong key={i} className="text-brand01 font-bold">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

const CALLOUT_STYLE = {
  tip: { label: "こつ", box: "border-brand01 bg-bg01", tag: "bg-brand01 text-white" },
  warn: { label: "注意", box: "border-brand03 bg-white", tag: "bg-brand03 text-white" },
  info: { label: "補足", box: "border-brand01/30 bg-white", tag: "border-brand01/30 text-brand01 border" },
} as const;

function Callout({ tone, title, children }: { tone: keyof typeof CALLOUT_STYLE; title?: string; children: ReactNode }) {
  const style = CALLOUT_STYLE[tone];
  return (
    <div className={`${style.box} flex flex-col gap-1.5 border-l-4 p-4 text-sm`}>
      <p className="flex flex-wrap items-center gap-2">
        <span className={`${style.tag} px-2 py-0.5 text-xs font-bold`}>{style.label}</span>
        {title ? <span className="text-brand01 font-bold">{title}</span> : null}
      </p>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "text":
      return (
        <p className="leading-relaxed">
          <Emphasized text={block.text} />
        </p>
      );
    case "steps":
      return (
        <ol className="flex flex-col gap-3">
          {block.steps.map((step, i) => (
            <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-3">
              <span
                aria-hidden
                className="bg-brand01 flex size-7 items-center justify-center text-sm font-bold text-white tabular-nums"
              >
                {i + 1}
              </span>
              <div className="flex flex-col gap-1 pt-0.5">
                <p className="leading-relaxed">
                  <Emphasized text={step.text} />
                </p>
                {step.note ? (
                  <p className="text-brand04 text-sm leading-relaxed">
                    <Emphasized text={step.note} />
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          {block.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              <Emphasized text={item} />
            </li>
          ))}
        </ul>
      );
    case "callout":
      return (
        <Callout tone={block.tone} title={block.title}>
          <Emphasized text={block.text} />
        </Callout>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.head.map((h) => (
                  <th key={h} className="bg-brand01 border-brand01 border px-3 py-2 text-left font-bold text-white">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={`border-brand01/15 border bg-white px-3 py-2 align-top ${j === 0 ? "text-brand01 font-bold whitespace-nowrap" : ""}`}
                    >
                      <Emphasized text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "faq":
      return (
        <div className="border-brand01/15 border-t">
          {block.items.map((item) => (
            <details key={item.q} className="group border-brand01/15 border-b">
              <summary className="flex cursor-pointer list-none items-center gap-4 py-3.5 [&::-webkit-details-marker]:hidden">
                <span className="text-brand03 font-bold">Q</span>
                <span className="text-brand01 group-hover:text-brand03 min-w-0 flex-1 font-bold transition-colors">
                  {item.q}
                </span>
                <span aria-hidden className="text-brand01 transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <p className="pb-4 pl-8 text-sm leading-relaxed">
                <Emphasized text={item.a} />
              </p>
            </details>
          ))}
        </div>
      );
  }
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}
