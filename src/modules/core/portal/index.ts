// core/portal の公開 API。他の module・src/app はここ経由でのみ参照する。
export { PortalShell } from "./components/portal-shell";
export { PortalHome } from "./components/portal-home";
export { ComingSoon } from "./components/coming-soon";
export type {
  Navigation,
  NavLeaf,
  NavSection,
  Notice,
  NoticePriority,
  NoticeTarget,
  PortalApp,
  PortalLink,
  PortalUser,
} from "./types";
