// core/sso の公開 API(サーバー側)。別プロジェクトのアプリへのログインの受け渡し。docs/DESIGN.md 28 章。
export { ExternalAppFrame } from "./components/external-app-frame";
export { resolveExternalAppPage, resolveLaunchUrl } from "./launch";
export type { ExternalAppContract } from "./pass";
