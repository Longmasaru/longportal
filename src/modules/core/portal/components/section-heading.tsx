import type { ReactNode } from "react";

/**
 * heading/01 の業務画面向け縮小版。英字(大文字)を主、和文を従にした見出し。
 * 右側に補足やリンクを置ける。
 */
export function SectionHeading({
  en,
  ja,
  id,
  aside,
}: {
  en: string;
  ja: string;
  id: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 id={id} className="leading-none">
        <span className="font-heading text-brand01 block text-[1.625rem] font-black tracking-[0.05em]">
          {en}
        </span>
        <span className="text-brand04 mt-1.5 block text-sm font-medium tracking-[0.2em]">
          {ja}
        </span>
      </h2>
      {aside ? <div className="shrink-0 pb-0.5 text-sm">{aside}</div> : null}
    </div>
  );
}
