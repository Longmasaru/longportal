// 監査ログの操作名(action)の表示ラベル。未知の action はそのまま表示する。
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "employee.create": "社員の登録",
  "employee.update": "社員情報の更新",
  "employee.transfer": "異動(主所属の変更)",
  "employee.assignment.end": "所属の終了",
  "employee.assignment.location": "所属の拠点の付け直し",
  "employee.assignment.update": "所属の付け直し(部署・拠点)",
  "user.create": "アカウントの発行",
  "user.enable": "アカウントの有効化",
  "user.disable": "アカウントの無効化",
  "user.password_reset": "パスワードの再設定",
  "master.create": "組織マスタの追加",
  "master.update": "組織マスタの更新",
  "role.create": "ロールの作成",
  "role.update": "ロールの更新(権限)",
  "role.delete": "ロールの削除",
  "role_assignment.create": "ロールの割当",
  "role_assignment.delete": "ロール割当の解除",
  "audience.create": "Audience の作成",
  "audience.update": "Audience の更新",
  "audience.delete": "Audience の削除",
  "notice.create": "お知らせの作成",
  "notice.update": "お知らせの更新",
  "notice.unpublish": "お知らせを下書きに戻す",
  "notice.delete": "お知らせの削除",
  "link.create": "社内リンクの追加",
  "link.update": "社内リンクの更新",
  "link.delete": "社内リンクの削除",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}
