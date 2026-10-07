import type { Metadata } from "next";
import { Jost } from "next/font/google";
import "./globals.css";

/* 英字・数字・大見出し用。仕様書の futura-pt(Adobe Fonts)の代替として、
   同じジオメトリックサンセリフの Jost を使う。 */
const futura = Jost({
  variable: "--font-futura",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
});

export const metadata: Metadata = {
  title: "LONG PORTAL",
  description: "株式会社ロング 社内ポータル",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${futura.variable} h-full antialiased`}>
      <head>
        {/* 和文の Zen Kaku Gothic New は next/font が日本語サブセットを持たないため、
            Google Fonts から読み込む */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router のルートレイアウトなので全ページに適用される */}
        <link
          href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
