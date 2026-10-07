// core の権限(permission)の定義。code はここ(コード)で定義し、sync で DB に反映する。
// 各アプリの権限は、そのアプリの manifest で定義する(手順 6 以降)。
// 新しい権限を足すと、sync で system_admin に自動付与される(他のロールには付与されない)。

export const CORE_PERMISSIONS = [
  { code: "core.employees.manage", description: "社員・所属(異動履歴)・ログインアカウントの管理" },
  { code: "core.organization.manage", description: "組織マスタ(部署・拠点・役職・雇用区分)の管理" },
  { code: "core.roles.manage", description: "ロール・ロールの権限・ロール割当の管理" },
  { code: "core.audit.view", description: "監査ログの閲覧" },
  { code: "core.audiences.manage", description: "Audience(対象者条件)の管理(画面は手順5で追加)" },
  { code: "core.apps.manage", description: "アプリ登録(表示名・Audience・表示順など)の管理(画面は手順6で追加)" },
] as const;

export type CorePermissionCode = (typeof CORE_PERMISSIONS)[number]["code"];

/** 権限の定義(アプリの manifest もこの形で渡す)。 */
export type PermissionDefinition = {
  code: string;
  description: string;
  /** core の権限は省略(NULL)。 */
  appKey?: string;
};

export const SYSTEM_ADMIN_ROLE_CODE = "system_admin";
export const SYSTEM_ADMIN_ROLE_NAME = "システム管理者";

/** sync の対象(いまは core のみ。手順 6 でアプリの manifest を加える)。 */
export function allPermissionDefinitions(): PermissionDefinition[] {
  return CORE_PERMISSIONS.map((p) => ({ code: p.code, description: p.description }));
}
