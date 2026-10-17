// 別プロジェクトのアプリを、ポータルの画面(ヘッダー・サイドバー)の中に埋め込む枠。docs/DESIGN.md 28 章。
// 中身はポータルと同じ住所から配信される(next.config の rewrites)ので、ログイン状態の cookie も同じサイトのものになる。
export function ExternalAppFrame({ title, src }: { title: string; src: string }) {
  return <iframe title={title} src={src} allow="fullscreen" className="block h-[calc(100dvh-3.5rem)] w-full border-0" />;
}
