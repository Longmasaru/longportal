// UI 確認用のモックデータ(管理者ユーザー想定)。DB 実装後は queries.ts から DB 参照に置き換え、このファイルは削除する。
import type { NavLeaf, Notice, PortalApp, PortalLink, PortalUser } from "./types";

export const mockUser: PortalUser = {
  id: "mock-user-1",
  displayName: "山田 太郎",
  employeeNumber: "A0001",
  positionName: "部長",
  departmentName: "管理",
  locationName: "現工場",
  roleNames: ["システム管理者"],
  isAdmin: true,
};

/** 管理メニュー(管理権限のあるユーザーにだけ表示)。 */
export const mockAdminItems: NavLeaf[] = [
  { key: "employees", label: "社員管理", href: "/admin/employees", icon: "users" },
  { key: "organization", label: "組織管理", href: "/admin/organization", icon: "building" },
  { key: "roles", label: "権限管理", href: "/admin/roles", icon: "shield" },
  { key: "audiences", label: "Audience管理", href: "/admin/audiences", icon: "target" },
  { key: "apps-admin", label: "アプリ管理", href: "/admin/apps", icon: "layers" },
  { key: "audit-logs", label: "監査ログ", href: "/admin/audit-logs", icon: "clipboard" },
];

/** 管理者ユーザー用に全アプリを返す(実装後は Audience 判定で絞り込まれる)。 */
export const mockApps: PortalApp[] = [
  {
    appKey: "todo",
    displayName: "TODO",
    description: "個人のタスクを整理し、期限と優先度を管理します。",
    icon: "check-square",
    href: "/apps/todo",
    summary: { label: "未完了 3件", tone: "info" },
  },
  {
    appKey: "education",
    displayName: "教育・スキル",
    description: "教育の受講状況とスキルの習得状況を確認します。",
    icon: "graduation",
    href: "/apps/education",
    summary: { label: "未受講 2件", tone: "attention" },
  },
  {
    appKey: "improvement",
    displayName: "改善提案",
    description: "現場の気づきを提案として登録し、進捗を確認します。",
    icon: "lightbulb",
    href: "/apps/improvement",
    summary: { label: "審査待ち 4件", tone: "info" },
  },
  {
    appKey: "quality",
    displayName: "出し直し管理",
    description: "出し直しの記録と、原因・対策の状況を管理します。",
    icon: "redo",
    href: "/apps/quality",
    summary: { label: "未対応 1件", tone: "attention" },
  },
  {
    appKey: "manual",
    displayName: "マニュアル",
    description: "作業手順書や社内規程を検索して閲覧します。",
    icon: "file-text",
    href: "/apps/manual",
  },
  {
    appKey: "equipment",
    displayName: "設備管理",
    description: "設備台帳、点検、修理の記録を管理します。",
    icon: "wrench",
    href: "/apps/equipment",
    summary: { label: "点検期限 2件", tone: "attention" },
  },
];

export const mockLinks: PortalLink[] = [
  {
    id: "l1",
    title: "LINE WORKS",
    description: "メッセージ・カレンダー・掲示板",
    url: "https://line.worksmobile.com/jp/",
  },
  {
    id: "l2",
    title: "freee",
    description: "勤怠・経費・会計",
    url: "https://www.freee.co.jp/",
  },
  {
    id: "l3",
    title: "notePM",
    description: "社内ナレッジ・手順書",
    url: "https://notepm.jp/",
  },
  {
    id: "l4",
    title: "Google Drive",
    description: "共有ドライブ・ファイル",
    url: "https://drive.google.com/",
  },
];

/**
 * 閲覧者(=管理者ユーザー)から見えるお知らせ。実装後は Audience・個人指定で絞り込まれる。
 * 緊急バナーの確認がいつでもできるよう、緊急の 1 件は「今日」を基準にする。
 */
export function createMockNotices(today: string): Notice[] {
  return [
    // --- 全社宛 ---
    {
      id: "c0",
      title: "【緊急】本日17時から構内の定期停電のため、全設備を停止します",
      summary:
        "17:00〜19:00は全設備が使用できません。17時までに各工程の作業を終了し、電源を落としてください。",
      kind: "safety",
      priority: "urgent",
      target: "company",
      publishedOn: today,
      isRead: false,
      requiresAction: false,
      bannerUntil: today,
      href: "/notices/company#c0",
    },
    {
      id: "c1",
      title: "10月10日(金)に全社一斉の避難訓練を実施します",
      summary:
        "午前10時開始です。各工場・事務所の責任者は、当日の集合場所を事前に確認してください。",
      kind: "event",
      priority: "important",
      target: "company",
      publishedOn: "2026-09-29",
      isRead: false,
      requiresAction: false,
      href: "/notices/company#c1",
    },
    {
      id: "c2",
      title: "10月1日から出し直し報告の様式を変更します",
      summary:
        "新様式の入力はポータルの「出し直し管理」から行います。旧様式のExcelは9月末で受付を終了します。",
      kind: "rule",
      priority: "important",
      target: "company",
      publishedOn: "2026-09-26",
      isRead: true,
      requiresAction: false,
      href: "/notices/company#c2",
    },
    {
      id: "c3",
      title: "10月12日(日)20:00〜22:00 ポータルのメンテナンスを行います",
      summary: "作業中はポータルおよび各業務アプリを利用できません。",
      kind: "system",
      priority: "important",
      target: "company",
      publishedOn: "2026-09-24",
      isRead: true,
      requiresAction: false,
      href: "/notices/company#c3",
    },
    {
      id: "c4",
      title: "定期健康診断の受診日程のご案内",
      summary: "受診日は部署ごとに異なります。個別の日程は各部署の責任者から連絡があります。",
      kind: "health",
      priority: "normal",
      target: "company",
      publishedOn: "2026-09-20",
      isRead: true,
      requiresAction: false,
      href: "/notices/company#c4",
    },

    // --- 個人宛(個人指定・特定 Audience 宛) ---
    {
      id: "p1",
      title: "出し直し報告 #2026-0412 の承認依頼が届いています",
      summary: "溶接工程の不良に関する報告です。内容を確認して承認または差し戻しをしてください。",
      kind: "approval",
      priority: "normal",
      target: "individual",
      publishedOn: today,
      isRead: false,
      requiresAction: true,
      href: "/notices/personal#p1",
    },
    {
      id: "p2",
      title: "フォークリフト安全講習の受講期限は10月15日です",
      summary: "受講対象者として登録されています。未受講の場合は日程を予約してください。",
      kind: "education",
      priority: "normal",
      target: "audience",
      publishedOn: "2026-09-30",
      isRead: false,
      requiresAction: true,
      href: "/notices/personal#p2",
    },
    {
      id: "p3",
      title: "設備の点検期限が近い設備が2台あります",
      summary: "担当設備のうち、10月末が期限の点検が未実施です。",
      kind: "case",
      priority: "normal",
      target: "individual",
      publishedOn: "2026-09-30",
      isRead: false,
      requiresAction: true,
      href: "/notices/personal#p3",
    },
    {
      id: "p4",
      title: "改善提案「治具の共通化」にコメントが付きました",
      summary: "提案の審査担当者からコメントが届いています。",
      kind: "general",
      priority: "normal",
      target: "individual",
      publishedOn: "2026-09-29",
      isRead: false,
      requiresAction: false,
      href: "/notices/personal#p4",
    },
    {
      id: "p5",
      title: "10月度の溶接班シフトが更新されました",
      summary: "溶接班に所属する社員向けの連絡です。",
      kind: "request",
      priority: "normal",
      target: "audience",
      publishedOn: "2026-09-28",
      isRead: true,
      requiresAction: false,
      href: "/notices/personal#p5",
    },
  ];
}
