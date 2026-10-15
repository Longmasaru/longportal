// アプリの登録簿の選択肢(画面・サーバー・スキーマで共通。DB に依存しないので、クライアントからも読める)。
// docs/DESIGN.md 24 章。
import type { IconName } from "../portal/types";

export const APP_KINDS = ["internal", "external"] as const;
export type AppKind = (typeof APP_KINDS)[number];

export const APP_TARGETS = ["company", "audience"] as const;
export type AppTarget = (typeof APP_TARGETS)[number];

/** app_key の形(永続 ID。一度作ったら変えない)。 */
export const APP_KEY_PATTERN = /^[a-z][a-z0-9_-]{1,39}$/;

/** アプリに選べるアイコン(ポータルのアイコンのうち、アプリ向けのもの)。 */
export const APP_ICONS = [
  "grid",
  "check-square",
  "graduation",
  "lightbulb",
  "sprout",
  "redo",
  "file-text",
  "wrench",
  "clipboard",
  "layers",
  "target",
  "users",
  "building",
  "megaphone",
  "link",
] as const satisfies readonly IconName[];
export type AppIcon = (typeof APP_ICONS)[number];

export const APP_ICON_LABEL: Record<AppIcon, string> = {
  grid: "一覧",
  "check-square": "チェック",
  graduation: "教育",
  lightbulb: "アイデア",
  sprout: "芽",
  redo: "やり直し",
  "file-text": "文書",
  wrench: "工具",
  clipboard: "記録",
  layers: "重なり",
  target: "的",
  users: "人",
  building: "建物",
  megaphone: "拡声器",
  link: "リンク",
};

/** 業務アプリ(modules/apps/○○)が定義する manifest の形(docs/DESIGN.md 8 章)。 */
export type AppManifest = {
  appKey: string;
  route: string;
  /** 初回登録時の表示名・説明・アイコン(以後は管理画面の設定が優先)。 */
  displayName: string;
  description: string;
  icon: AppIcon;
  permissions: readonly { code: string; description: string }[];
  scopedEntities: readonly string[];
  version: number;
};
