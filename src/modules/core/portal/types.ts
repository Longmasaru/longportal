// ポータル画面が受け取るデータの型。
// 現在は mock-data.ts が返すが、手順4〜7 で DB(core.users / employees / app_registry /
// announcements / portal_links)と Audience 判定の結果に差し替える。画面側はこの型だけに依存する。

export type IconName =
  | "home"
  | "grid"
  | "bell"
  | "megaphone"
  | "link"
  | "users"
  | "building"
  | "shield"
  | "target"
  | "layers"
  | "clipboard"
  | "check-square"
  | "graduation"
  | "lightbulb"
  | "redo"
  | "file-text"
  | "wrench"
  | "external"
  | "chevron-right"
  | "chevron-down"
  | "menu"
  | "close"
  | "user"
  | "key"
  | "logout"
  | "alert";

/** ログイン中ユーザー(core.users + core.employees + 現在有効な主所属 + 役職)。 */
export type PortalUser = {
  id: string;
  displayName: string;
  /** 例: 「現工場 / 管理 ・ 部長」。社員以外のアカウント・未配属は代替の文言。 */
  subtitle: string;
  /** 社員以外のユーザーは null。 */
  employeeNumber: string | null;
  /** 表示用のロール名(core.roles.name)。手順4で roles に接続するまでは暫定値。 */
  roleNames: string[];
  /** 管理メニューを出すか。手順4で role / permission に接続するまでは暫定値。 */
  isAdmin: boolean;
};

// ---- サイドバー ------------------------------------------------------------

export type NavLeaf = {
  key: string;
  label: string;
  href: string;
  icon?: IconName;
  /** 未読件数など。0 または未指定なら表示しない。 */
  badge?: number;
  /** 社内リンクなど、別タブで開く外部 URL。 */
  external?: boolean;
};

export type NavSection = {
  key: string;
  en: string;
  ja: string;
  items: NavLeaf[];
  /** 折りたたみ可能にするか(管理メニューなど)。 */
  collapsible?: boolean;
  /** 項目が 0 件のときに出す説明(枠だけを残す)。 */
  emptyText?: string;
};

export type Navigation = {
  home: NavLeaf;
  /** 管理メニューは管理権限のあるユーザーにだけ含まれる。 */
  sections: NavSection[];
};

// ---- アプリ ----------------------------------------------------------------

export type BadgeTone = "info" | "attention";

/** ポータルに表示するアプリ(manifest + core.app_registry + Audience 判定後の結果)。 */
export type PortalApp = {
  appKey: string;
  displayName: string;
  description: string;
  icon: IconName;
  href: string;
  /** アプリ側が提供する未処理件数などの要約。 */
  summary?: { label: string; tone: BadgeTone };
};

// ---- お知らせ --------------------------------------------------------------
// 個人向けと全社向けを別テーブルにせず、1 つの共通モデルで表す(core.announcements 想定)。
// 「個人」「重要・全社」の振り分けは target(誰宛か)から導く(notices.ts の noticeChannel)。

/** 誰宛か: 全社員 / 特定の Audience / 個人指定。 */
export type NoticeTarget = "company" | "audience" | "individual";

/** 重要度。urgent はホーム上部のバナー表示の対象になりうる。 */
export type NoticePriority = "normal" | "important" | "urgent";

/** お知らせの種別(表示ラベルと将来の絞り込み用)。 */
export type NoticeKind =
  | "general"
  | "request"
  | "approval"
  | "education"
  | "case"
  | "safety"
  | "health"
  | "event"
  | "rule"
  | "system";

export type Notice = {
  id: string;
  title: string;
  summary: string;
  kind: NoticeKind;
  priority: NoticePriority;
  target: NoticeTarget;
  /** `YYYY-MM-DD` */
  publishedOn: string;
  /** 閲覧者本人が既読か(announcement_reads 想定)。 */
  isRead: boolean;
  /** 閲覧者本人の対応(確認・承認など)が必要か。 */
  requiresAction: boolean;
  /** ホーム上部バナーの表示期限(`YYYY-MM-DD`、この日を含む)。urgent かつ全社宛のみ有効。 */
  bannerUntil?: string;
  href: string;
};

/** 社内リンク(core.portal_links)。サイドバーに常時表示する。 */
export type PortalLink = {
  id: string;
  title: string;
  description: string;
  url: string;
};

// ---- 画面ごとのデータ ------------------------------------------------------

export type PortalContext = {
  user: PortalUser;
  navigation: Navigation;
};

export type PortalHomeData = {
  /** ホーム上部に出す緊急・重要な全社連絡。該当がなければ空。 */
  urgentBanners: Notice[];
  /** あなたへのお知らせ(要対応・未読を優先)。 */
  personalNotices: Notice[];
  /** personalNotices のうち、対応が必要なものの件数(表示件数ではなく全体の件数)。 */
  actionRequiredCount: number;
  /** 各アプリが報告する未対応・要確認の件数。該当がなければ空(セクションごと非表示)。 */
  pendingItems: PendingItem[];
};

/** アプリ側が「本人の対応が必要」と報告する件数(アプリへの導線を兼ねる)。 */
export type PendingItem = {
  appKey: string;
  appName: string;
  icon: IconName;
  /** 例: 「未受講 2件」 */
  label: string;
  href: string;
};
