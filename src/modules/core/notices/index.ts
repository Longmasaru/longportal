// core/notices の公開 API(サーバー側)。
export { AdminNoticesPage, AdminNoticeNewPage, AdminNoticeEditPage } from "./components/notice-admin-pages";
export { NoticeListPage, NoticeDetailPage, type NoticeChannel } from "./components/notice-viewer-pages";
export { listNoticesForActor, type ViewerNotice } from "./queries";
export { APP_NOTICE_DAYS, createAppNotice } from "./app-notices";
