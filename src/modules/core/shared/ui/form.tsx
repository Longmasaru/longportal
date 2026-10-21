import type { ReactNode } from "react";

// 管理画面・認証画面で共通のフォーム部品とスタイル(デザインシステムのトークンのみ使用)。
// クライアントコンポーネントからも使えるよう、hooks や server 専用の依存を持たない。

export const FIELD_CLASS =
  "bg-field text-brand01 placeholder:text-brand04 block w-full px-3 py-2 outline-none focus-visible:outline-2 focus-visible:outline-brand01 disabled:opacity-60";
export const LABEL_CLASS = "text-brand01 mb-1.5 block text-sm font-bold";
export const BUTTON_PRIMARY =
  "bg-brand01 px-5 py-2.5 text-sm font-bold tracking-[0.1em] text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:bg-field disabled:text-brand04";
export const BUTTON_SECONDARY =
  "border-brand01 text-brand01 hover:text-brand03 hover:border-brand03 border bg-white px-4 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const LINK_CLASS = "text-brand01 hover:text-brand03 font-bold transition-colors";

export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={LABEL_CLASS}>
        {label}
        {required ? (
          <span className="bg-brand03 ml-2 px-1 text-xs font-normal text-white">必須</span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="text-brand04 mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

/** フォーム上部の通知。error / success / info / warning。 */
export function FormNotice({
  tone,
  children,
}: {
  tone: "error" | "success" | "info" | "warning";
  children: ReactNode;
}) {
  const style = {
    error: "border-brand03 bg-brand03/10",
    warning: "border-brand03 bg-brand03/10",
    success: "border-link bg-bg01",
    info: "border-link bg-bg01",
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`text-brand01 border-l-4 px-3 py-2 text-sm ${style}`}
    >
      {children}
    </div>
  );
}

/** 画面見出し(管理画面用)。 */
export function PageHeading({
  title,
  description,
  aside,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-brand01 text-2xl font-bold">{title}</h1>
        {description ? <p className="text-brand04 mt-1 text-sm">{description}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

export function StatusTag({
  tone,
  children,
}: {
  tone: "neutral" | "info" | "attention" | "muted";
  children: ReactNode;
}) {
  const style = {
    neutral: "bg-field text-brand04",
    info: "bg-bg01 text-brand01",
    attention: "bg-brand03 text-white",
    muted: "border border-brand04/40 text-brand04",
  }[tone];
  return <span className={`inline-block px-1.5 text-xs leading-5 font-bold ${style}`}>{children}</span>;
}
