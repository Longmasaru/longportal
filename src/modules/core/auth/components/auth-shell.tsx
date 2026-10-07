import type { ReactNode } from "react";

/** ログイン・パスワード変更など、ポータルの枠(サイドバー)を持たない認証系画面の共通レイアウト。 */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="bg-bg01 flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="font-heading text-brand01 text-center text-3xl font-black tracking-[0.12em]">
          LONG PORTAL
        </p>
        <p className="text-brand04 mt-1 text-center text-xs tracking-[0.15em]">株式会社ロング</p>
        <div className="mt-8 bg-white px-6 py-8">
          <h1 className="text-brand01 mb-6 text-center text-lg font-bold">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}

export const FIELD_CLASS =
  "bg-field text-brand01 placeholder:text-brand04 block w-full px-4 py-2.5 outline-none focus-visible:outline-2 focus-visible:outline-brand01";
export const LABEL_CLASS = "text-brand01 mb-1.5 block text-sm font-bold";
export const SUBMIT_CLASS =
  "bg-brand01 w-full py-3 font-bold tracking-[0.2em] text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:bg-field disabled:text-brand04";

/** フォーム上部の通知(エラー・案内)。 */
export function Notice({
  tone,
  children,
}: {
  tone: "error" | "info";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`text-brand01 mb-5 border-l-4 px-3 py-2 text-sm ${
        tone === "error" ? "border-brand03 bg-brand03/10" : "border-link bg-bg01"
      }`}
    >
      {children}
    </p>
  );
}
