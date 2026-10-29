import type { NextConfig } from "next";

// 基本のセキュリティヘッダー。ログイン画面などを、他のサイトの中に埋め込まれる(クリックジャッキング)のを防ぐ。
// マイクは、人事管理の記録の音声入力のため、自分のサイトにだけ許す(docs/DESIGN.md 31.3)。
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

// ポータルの住所の中で表示する、別プロジェクトのアプリ(Next.js の multi-zones。docs/DESIGN.md 28 章)。
// path への要求を origin のアプリへ転送する。アプリ側は basePath を同じ path にする。
// path は modules/apps/external-apps.ts の embedPath と同じにする。
const ZONES = [
  { path: "/aikyoshitsu", origin: process.env.AIKYOSHITSU_ORIGIN ?? "https://ai-kyoshitsu.vercel.app" },
  { path: "/order-csv", origin: process.env.ORDERCSV_ORIGIN ?? "https://order-csv-beta.vercel.app" },
];

const nextConfig: NextConfig = {
  async headers() {
    // 転送先のアプリの住所は、アプリが自分のヘッダー(同じ住所からの埋め込みだけ許す)を返す。
    const notZone = ZONES.map((z) => z.path.slice(1)).join("|");
    return [{ source: `/((?!(?:${notZone})(?:/|$)).*)`, headers: securityHeaders }];
  },
  async rewrites() {
    return ZONES.flatMap((z) => [
      { source: z.path, destination: `${z.origin}${z.path}` },
      { source: `${z.path}/:path+`, destination: `${z.origin}${z.path}/:path+` },
    ]);
  },
};

export default nextConfig;
