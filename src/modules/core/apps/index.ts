// core/apps の公開 API(サーバー側)。docs/DESIGN.md 24 章。
export { AdminAppsPage } from "./components/admin-apps-page";
export { canAccessApp, listAppsForActor, requireAppAccess } from "./queries";
export { syncAppRegistry, type AppSyncReport } from "./sync";
export type { AppIcon, AppManifest } from "./constants";
