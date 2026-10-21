import type { AppManifest } from "@/modules/core/apps";

// アプリの技術的な存在・契約(docs/DESIGN.md 8 章・24 章・42 章)。npm run sync:manifests で app_registry に登録する。
// 表示名・説明・アイコンは初回登録時の値で、以後は管理画面(/admin/apps)の設定が優先される。
// 投稿は、表示する相手に当てはまる社員なら誰でもできる。全投稿の閲覧と、リーダー宛ての返事だけ、専用の権限にする。
export const manifest = {
  appKey: "meyasubako",
  route: "/apps/meyasubako",
  displayName: "目安箱",
  description: "要望・ヒヤリハット・困りごとなどを、スマホからひとこと送れます。",
  icon: "lightbulb",
  permissions: [
    { code: "meyasubako.posts.manage", description: "目安箱の全投稿の閲覧・返事・状況の変更・削除(全社で割り当てる)" },
    {
      code: "meyasubako.leader.respond",
      description: "目安箱の「リーダー宛て」の投稿のうち、割当の拠点・部署の社員のものの閲覧・返事・状況の変更",
    },
  ],
  scopedEntities: ["meyasubako.posts"],
  version: 1,
} as const satisfies AppManifest;
