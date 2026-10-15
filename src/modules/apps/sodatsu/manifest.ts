// アプリの技術的な存在・契約(docs/DESIGN.md 8 章)。
// app registry(手順 6)の実装時に、この manifest を sync:manifests の対象にする。
// 閲覧だけのアプリなので、専用の権限は持たない(ログインした社員なら誰でも見られる)。
export const manifest = {
  appKey: "sodatsu",
  route: "/apps/sodatsu",
  displayName: "育てて、育つ。",
  description: "ロングの人事ポリシー「育てて、育つ。」の考え方と、今日からできることをまとめています。",
  permissions: [] as { code: string; name: string }[],
  scopedEntities: [] as string[],
  version: 1,
} as const;
